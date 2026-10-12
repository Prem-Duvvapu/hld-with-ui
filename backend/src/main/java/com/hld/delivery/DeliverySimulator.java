package com.hld.delivery;

import com.hld.delivery.DeliveryEvent.Changes;
import com.hld.delivery.DeliveryEvent.Kind;
import com.hld.delivery.DeliveryInput.AcknowledgmentPolicy;
import com.hld.delivery.DeliveryInput.FailureAction;
import com.hld.delivery.DeliveryResult.FailureOutcome;
import com.hld.delivery.DeliveryResult.FailureOutcomeStatus;
import com.hld.delivery.DeliveryResult.LossOutcomeStatus;
import com.hld.delivery.DeliveryResult.LostAcknowledgmentOutcome;
import com.hld.delivery.DeliveryResult.MessageOutcome;
import com.hld.delivery.DeliveryState.AckStatus;
import com.hld.delivery.DeliveryState.Attempt;
import com.hld.delivery.DeliveryState.BrokerStatus;
import com.hld.delivery.DeliveryState.Consumer;
import com.hld.delivery.DeliveryState.ConsumerStatus;
import com.hld.delivery.DeliveryState.EffectStatus;
import com.hld.delivery.DeliveryState.LeaseStatus;
import com.hld.delivery.DeliveryState.Message;
import com.hld.simulation.engine.BudgetExceededException;
import com.hld.simulation.engine.SimulationBudget;
import com.hld.simulation.engine.SimulationContext;

import java.lang.reflect.RecordComponent;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.PriorityQueue;
import java.util.Set;
import java.util.function.Function;

/** Concrete virtual broker/consumer/ledger model; acknowledgment is independent of durable work. */
public final class DeliverySimulator {
    public static final String SIMULATION_ID = "queues-delivery";
    public static final String MODEL_VERSION = DeliveryInput.MODEL_VERSION;
    public static final List<String> ASSUMPTIONS =
            List.of(
                    "Illustrative durable broker and ledger; consumer failure does not erase a"
                        + " committed append.",
                    "Broker acknowledgment and ledger effect share no transaction; there is no"
                        + " duplicate protection.",
                    "One processing slot per consumer, freed on effect commit/cancellation; early"
                        + " ACK does not free it.",
                    "Only the current lease token strictly before its deadline is accepted; this is"
                        + " model policy, not an SQS guarantee.",
                    "Expiry permits another delivery without fencing running work; dead-lettering"
                        + " does not erase effects.",
                    "Transport delay is zero except configured ACK delay; selected transport loss"
                        + " precedes token validation.",
                    "Same-time phases: effects, expiry, ACK, crash, recovery/enqueue, dispatch;"
                        + " same-phase insertion order.",
                    "Recovery actions are initially scheduled before message enqueues; dispatch"
                        + " uses availability then input order.",
                    "Pending ACK includes planned ACK-after-effect. Scheduled times are not"
                        + " observed completions.",
                    "Completed means settled, not business success; confirmed ACK-without-effect is"
                        + " unknown on limited prefixes.",
                    "Producer failures, broker loss/replication, lease extension, backoff and"
                        + " external providers are excluded.",
                    "Seed is replay metadata; no random choices. External wall guards may censor"
                        + " differently across machines.");
    private final SimulationBudget budget;

    public DeliverySimulator() {
        this(SimulationBudget.defaults());
    }

    public DeliverySimulator(SimulationBudget budget) {
        if (budget == null
                || budget.maxEvents() < 0
                || budget.maxTraceBytes() < 2
                || budget.maxVirtualTimeMs() < 0)
            throw new IllegalArgumentException(
                    "Require nonnegative event/time limits and at least two trace bytes.");
        this.budget = budget;
    }

    public DeliveryResult run(DeliveryInput input) {
        DeliveryValidator.validate(input);
        return new Run(input, budget).execute();
    }

    private enum ActionKind {
        ENQUEUE,
        EFFECT,
        EXPIRE,
        ACK,
        CRASH,
        RECOVER,
        DISPATCH
    }

    private record Action(
            long time, int phase, long order, ActionKind kind, String subject, int index) {}

    private static final class Run {
        final DeliveryInput input;
        final SimulationBudget budget;
        final SimulationContext guard;
        final PriorityQueue<Action> actions =
                new PriorityQueue<>(
                        Comparator.comparingLong(Action::time)
                                .thenComparingInt(Action::phase)
                                .thenComparingLong(Action::order));
        final List<DeliveryEvent> events = new ArrayList<>();
        final List<LedgerEntry> ledger = new ArrayList<>();
        final Set<Integer> reachedFailures = new HashSet<>();
        final Set<String> reachedLosses = new HashSet<>();
        final DeliveryState initialState;
        DeliveryState state;
        long schedulingSequence, traceBytes = 2, lastTime;
        String reason;

        Run(DeliveryInput input, SimulationBudget budget) {
            this.input = input;
            this.budget = budget;
            guard = new SimulationContext(budget, input.seed(), input.seed());
            initialState =
                    new DeliveryState(
                            input.messages().stream()
                                    .map(
                                            m ->
                                                    new Message(
                                                            m.id(),
                                                            BrokerStatus.NOT_ENQUEUED,
                                                            m.enqueueTimeMs(),
                                                            null,
                                                            0,
                                                            null,
                                                            null))
                                    .toList(),
                            input.consumers().stream()
                                    .map(c -> new Consumer(c.id(), ConsumerStatus.READY, null))
                                    .toList(),
                            List.of());
            state = initialState;
            for (int i = 0; i < input.failures().size(); i++) {
                var f = input.failures().get(i);
                actions.add(
                        new Action(
                                f.timeMs(),
                                f.action() == FailureAction.CRASH ? 4 : 5,
                                schedulingSequence++,
                                f.action() == FailureAction.CRASH
                                        ? ActionKind.CRASH
                                        : ActionKind.RECOVER,
                                f.consumerId(),
                                i));
            }
            for (int i = 0; i < input.messages().size(); i++) {
                var m = input.messages().get(i);
                actions.add(
                        new Action(
                                m.enqueueTimeMs(),
                                5,
                                schedulingSequence++,
                                ActionKind.ENQUEUE,
                                m.id(),
                                i));
            }
        }

        DeliveryResult execute() {
            while (true) {
                // Invalid timers never advance observation time or trigger an unnecessary time
                // guard.
                while (!actions.isEmpty() && !valid(actions.peek())) actions.remove();
                if (actions.isEmpty()) break;
                Action action = actions.remove();
                if (!timeAllowed(action.time())) break;
                Stage stage = new Stage(action.time());
                stage.apply(action);
                if (!admit(stage)) break;
                state = stage.snapshot();
                events.addAll(stage.batch);
                ledger.addAll(stage.appends);
                actions.addAll(stage.future);
                reachedFailures.addAll(stage.failures);
                reachedLosses.addAll(stage.losses);
                schedulingSequence = stage.nextOrder;
                traceBytes = stage.admittedBytes;
                lastTime = action.time();
                checkInvariants();
            }
            if (reason == null
                    && state.messages().stream().anyMatch(m -> m.status() == BrokerStatus.READY))
                reason = "no_future_progress";
            return result();
        }

        boolean valid(Action action) {
            return switch (action.kind()) {
                case ENQUEUE -> message(action.subject()).status() == BrokerStatus.NOT_ENQUEUED;
                case CRASH, RECOVER -> true;
                case DISPATCH -> readyMessage(state) >= 0 && idleConsumer(state) >= 0;
                case EFFECT -> {
                    Attempt a = attempt(action.subject());
                    Consumer c = consumer(a.consumerId());
                    yield a.effectStatus() == EffectStatus.PROCESSING
                            && c.status() == ConsumerStatus.READY
                            && a.id().equals(c.currentAttemptId());
                }
                case ACK -> {
                    Attempt a = attempt(action.subject());
                    yield a.ackStatus() == AckStatus.PENDING
                            && consumer(a.consumerId()).status() == ConsumerStatus.READY
                            && (input.acknowledgmentPolicy()
                                            == AcknowledgmentPolicy.ACK_BEFORE_EFFECT
                                    || a.effectStatus() == EffectStatus.COMMITTED);
                }
                case EXPIRE -> {
                    Attempt a = attempt(action.subject());
                    Message m = message(a.messageId());
                    yield a.leaseStatus() == LeaseStatus.ACTIVE
                            && m.status() == BrokerStatus.LEASED
                            && a.id().equals(m.currentAttemptId());
                }
            };
        }

        boolean timeAllowed(long time) {
            if (time > budget.maxVirtualTimeMs()) {
                reason = "virtual_time_limit";
                return false;
            }
            try {
                guard.checkDeadline();
            } catch (BudgetExceededException e) {
                reason = e.truncationReason();
                return false;
            }
            return true;
        }

        boolean admit(Stage stage) {
            if ((long) events.size() + stage.batch.size() > budget.maxEvents()) {
                reason = "event_limit";
                return false;
            }
            long bytes = traceBytes;
            for (int i = 0; i < stage.batch.size(); i++)
                bytes +=
                        estimatedEventBytes(stage.batch.get(i))
                                + (events.isEmpty() && i == 0 ? 0 : 1);
            if (bytes > budget.maxTraceBytes()) {
                reason = "trace_size_limit";
                return false;
            }
            if (!timeAllowed(stage.time)) return false;
            stage.admittedBytes = bytes;
            return true;
        }

        Message message(String id) {
            return state.messages().stream()
                    .filter(m -> m.id().equals(id))
                    .findFirst()
                    .orElseThrow();
        }

        Consumer consumer(String id) {
            return state.consumers().stream()
                    .filter(c -> c.id().equals(id))
                    .findFirst()
                    .orElseThrow();
        }

        Attempt attempt(String id) {
            return state.attempts().stream()
                    .filter(a -> a.id().equals(id))
                    .findFirst()
                    .orElseThrow();
        }

        final class Stage {
            final long time;
            final List<Message> messages = new ArrayList<>(state.messages());
            final List<Consumer> consumers = new ArrayList<>(state.consumers());
            final List<Attempt> attempts = new ArrayList<>(state.attempts());
            final List<DeliveryEvent> batch = new ArrayList<>();
            final List<LedgerEntry> appends = new ArrayList<>();
            final List<Action> future = new ArrayList<>();
            final Set<Integer> failures = new HashSet<>();
            final Set<String> losses = new HashSet<>();
            DeliveryState previous = state;
            long nextOrder = schedulingSequence, admittedBytes;

            Stage(long time) {
                this.time = time;
            }

            DeliveryState snapshot() {
                return new DeliveryState(messages, consumers, attempts);
            }

            Message msg(String id) {
                return messages.stream().filter(m -> m.id().equals(id)).findFirst().orElseThrow();
            }

            Consumer con(String id) {
                return consumers.stream().filter(c -> c.id().equals(id)).findFirst().orElseThrow();
            }

            Attempt att(String id) {
                return attempts.stream().filter(a -> a.id().equals(id)).findFirst().orElseThrow();
            }

            void put(Message m) {
                replace(messages, m, Message::id);
            }

            void put(Consumer c) {
                replace(consumers, c, Consumer::id);
            }

            void put(Attempt a) {
                replace(attempts, a, Attempt::id);
            }

            void schedule(long at, int phase, ActionKind kind, String subject) {
                future.add(new Action(at, phase, nextOrder++, kind, subject, -1));
            }

            void dispatchLater() {
                schedule(time, 6, ActionKind.DISPATCH, "");
            }

            void emit(
                    Kind kind,
                    String mid,
                    String aid,
                    String cid,
                    String narration,
                    LedgerEntry entry) {
                DeliveryState now = snapshot();
                batch.add(
                        new DeliveryEvent(
                                events.size() + batch.size() + 1,
                                time,
                                kind,
                                mid,
                                aid,
                                cid,
                                narration,
                                new Changes(
                                        changed(previous.messages(), now.messages(), Message::id),
                                        changed(
                                                previous.consumers(),
                                                now.consumers(),
                                                Consumer::id),
                                        changed(previous.attempts(), now.attempts(), Attempt::id)),
                                entry));
                previous = now;
                if (entry != null) appends.add(entry);
            }

            void apply(Action action) {
                switch (action.kind()) {
                    case ENQUEUE -> {
                        Message m = msg(action.subject());
                        put(
                                new Message(
                                        m.id(),
                                        BrokerStatus.READY,
                                        m.enqueueTimeMs(),
                                        time,
                                        0,
                                        null,
                                        null));
                        emit(
                                Kind.MESSAGE_ENQUEUED,
                                m.id(),
                                null,
                                null,
                                "The accepted message becomes ready in the broker.",
                                null);
                        dispatchLater();
                    }
                    case DISPATCH -> start();
                    case EFFECT -> effect(action.subject());
                    case EXPIRE -> expire(action.subject());
                    case ACK -> acknowledge(action.subject());
                    case CRASH -> crash(action.subject());
                    case RECOVER -> {
                        Consumer c = con(action.subject());
                        put(new Consumer(c.id(), ConsumerStatus.READY, null));
                        emit(
                                Kind.CONSUMER_RECOVERED,
                                null,
                                null,
                                c.id(),
                                "The consumer recovers without reviving cancelled work.",
                                null);
                        dispatchLater();
                    }
                }
                if (action.kind() == ActionKind.CRASH || action.kind() == ActionKind.RECOVER)
                    failures.add(action.index());
            }

            void start() {
                DeliveryState current = snapshot();
                Message m = messages.get(readyMessage(current));
                Consumer c = consumers.get(idleConsumer(current));
                int number = m.deliveryCount() + 1;
                String id = m.id() + "-a" + number;
                long effectAt = Math.addExact(time, input.processingTimeMs());
                long ackAt =
                        Math.addExact(
                                input.acknowledgmentPolicy()
                                                == AcknowledgmentPolicy.ACK_AFTER_EFFECT
                                        ? effectAt
                                        : time,
                                input.acknowledgmentDelayMs());
                Attempt a =
                        new Attempt(
                                id,
                                m.id(),
                                number,
                                c.id(),
                                id + "-lease",
                                Math.addExact(time, input.visibilityTimeoutMs()),
                                time,
                                effectAt,
                                ackAt,
                                LeaseStatus.ACTIVE,
                                EffectStatus.PROCESSING,
                                AckStatus.PENDING,
                                null,
                                null,
                                null,
                                null);
                put(a);
                put(new Consumer(c.id(), ConsumerStatus.READY, id));
                put(
                        new Message(
                                m.id(),
                                BrokerStatus.LEASED,
                                m.enqueueTimeMs(),
                                m.availableSinceMs(),
                                number,
                                id,
                                null));
                emit(
                        Kind.DELIVERY_STARTED,
                        m.id(),
                        id,
                        c.id(),
                        "A new attempt reserves a consumer and receives a fresh lease token.",
                        null);
                schedule(effectAt, 1, ActionKind.EFFECT, id);
                schedule(a.leaseDeadlineMs(), 2, ActionKind.EXPIRE, id);
                schedule(ackAt, 3, ActionKind.ACK, id);
                dispatchLater();
            }

            void effect(String id) {
                Attempt a = att(id);
                Consumer c = con(a.consumerId());
                put(a.withEffect(EffectStatus.COMMITTED, time, a.cancelledAtMs()));
                put(new Consumer(c.id(), c.status(), null));
                emit(
                        Kind.EFFECT_COMMITTED,
                        a.messageId(),
                        id,
                        c.id(),
                        "One durable ledger append commits; the processing slot becomes free.",
                        new LedgerEntry(id + "-effect", a.messageId(), id, c.id(), time));
                dispatchLater();
            }

            void expire(String id) {
                Attempt a = att(id);
                Message m = msg(a.messageId());
                put(a.withLease(LeaseStatus.EXPIRED));
                emit(
                        Kind.LEASE_EXPIRED,
                        m.id(),
                        id,
                        a.consumerId(),
                        "The token expires; any still-running ledger work remains valid.",
                        null);
                boolean retry = m.deliveryCount() < input.maxDeliveryAttempts();
                put(
                        new Message(
                                m.id(),
                                retry ? BrokerStatus.READY : BrokerStatus.DEAD_LETTERED,
                                m.enqueueTimeMs(),
                                retry ? time : m.availableSinceMs(),
                                m.deliveryCount(),
                                null,
                                null));
                emit(
                        retry ? Kind.MESSAGE_REQUEUED : Kind.MESSAGE_DEAD_LETTERED,
                        m.id(),
                        id,
                        a.consumerId(),
                        retry
                                ? "The broker makes the message eligible for another delivery."
                                : "The attempt budget is exhausted; the broker dead-letters the"
                                      + " message.",
                        null);
                if (retry) dispatchLater();
            }

            void acknowledge(String id) {
                Attempt a = att(id);
                put(a.withAck(AckStatus.SENT, time, null, a.cancelledAtMs()));
                emit(
                        Kind.ACK_SENT,
                        a.messageId(),
                        id,
                        a.consumerId(),
                        "The consumer sends acknowledgment for this attempt's token.",
                        null);
                a = att(id);
                Message m = msg(a.messageId());
                String selector = lossKey(a.messageId(), a.attempt());
                boolean lost =
                        input.lostAcknowledgments().stream()
                                .anyMatch(
                                        s -> lossKey(s.messageId(), s.attempt()).equals(selector));
                boolean accepted =
                        !lost
                                && m.status() == BrokerStatus.LEASED
                                && id.equals(m.currentAttemptId())
                                && a.leaseStatus() == LeaseStatus.ACTIVE
                                && time < a.leaseDeadlineMs();
                put(
                        a.withAck(
                                lost
                                        ? AckStatus.LOST
                                        : accepted ? AckStatus.ACCEPTED : AckStatus.STALE,
                                time,
                                time,
                                a.cancelledAtMs()));
                if (accepted) {
                    put(att(id).withLease(LeaseStatus.ACKNOWLEDGED));
                    put(
                            new Message(
                                    m.id(),
                                    BrokerStatus.ACKNOWLEDGED,
                                    m.enqueueTimeMs(),
                                    m.availableSinceMs(),
                                    m.deliveryCount(),
                                    null,
                                    time));
                }
                if (lost) losses.add(selector);
                emit(
                        lost ? Kind.ACK_LOST : accepted ? Kind.ACK_ACCEPTED : Kind.ACK_STALE,
                        m.id(),
                        id,
                        a.consumerId(),
                        lost
                                ? "Transport drops the ACK before the broker validates its token."
                                : accepted
                                        ? "The broker accepts its current token; this does not"
                                              + " prove a ledger effect."
                                        : "The broker rejects this expired or superseded token.",
                        null);
            }

            void crash(String consumerId) {
                Consumer c = con(consumerId);
                put(new Consumer(c.id(), ConsumerStatus.DOWN, c.currentAttemptId()));
                emit(
                        Kind.CONSUMER_CRASHED,
                        null,
                        null,
                        c.id(),
                        "The consumer crashes; durable broker and ledger state survive.",
                        null);
                for (Attempt original : List.copyOf(attempts)) {
                    if (!original.consumerId().equals(c.id())) continue;
                    Attempt a = att(original.id());
                    boolean processing = a.effectStatus() == EffectStatus.PROCESSING,
                            pendingAck = a.ackStatus() == AckStatus.PENDING;
                    if (!processing && !pendingAck) continue;
                    if (processing) a = a.withEffect(EffectStatus.CANCELLED, null, time);
                    if (pendingAck) a = a.withAck(AckStatus.CANCELLED, null, null, time);
                    put(a);
                    if (a.id().equals(con(c.id()).currentAttemptId()))
                        put(new Consumer(c.id(), ConsumerStatus.DOWN, null));
                    emit(
                            Kind.ATTEMPT_CANCELLED,
                            a.messageId(),
                            a.id(),
                            c.id(),
                            processing
                                    ? "The crash cancels uncommitted processing and unsent ACK; an"
                                          + " early accepted ACK survives."
                                    : "The crash cancels only the pending ACK; the committed ledger"
                                          + " append survives.",
                            null);
                }
            }
        }

        void checkInvariants() {
            Set<String> processing = new HashSet<>();
            for (Consumer c : state.consumers()) {
                if (c.status() == ConsumerStatus.DOWN && c.currentAttemptId() != null)
                    throw new IllegalStateException("Down consumer retains processing.");
                if (c.currentAttemptId() == null) continue;
                Attempt a = attempt(c.currentAttemptId());
                if (!processing.add(a.id())
                        || !a.consumerId().equals(c.id())
                        || a.effectStatus() != EffectStatus.PROCESSING)
                    throw new IllegalStateException("Consumer slot and effect state disagree.");
            }
            for (Attempt a : state.attempts()) {
                if ((a.effectStatus() == EffectStatus.PROCESSING) != processing.contains(a.id()))
                    throw new IllegalStateException("Processing slot missing.");
                long records = ledger.stream().filter(e -> e.attemptId().equals(a.id())).count();
                if (records != (a.effectStatus() == EffectStatus.COMMITTED ? 1 : 0))
                    throw new IllegalStateException("Effect and ledger disagree.");
                if ((a.leaseStatus() == LeaseStatus.ACKNOWLEDGED)
                        != (a.ackStatus() == AckStatus.ACCEPTED))
                    throw new IllegalStateException("Accepted token state disagrees.");
            }
            for (Message m : state.messages()) {
                if (state.attempts().stream().filter(a -> a.messageId().equals(m.id())).count()
                        != m.deliveryCount())
                    throw new IllegalStateException("Delivery count disagrees.");
                if ((m.status() == BrokerStatus.LEASED) != (m.currentAttemptId() != null))
                    throw new IllegalStateException("Broker allocation disagrees.");
                if (m.currentAttemptId() != null
                        && attempt(m.currentAttemptId()).leaseStatus() != LeaseStatus.ACTIVE)
                    throw new IllegalStateException("Quiescent broker token expired.");
                if ((m.status() == BrokerStatus.ACKNOWLEDGED) != (m.acknowledgedAtMs() != null))
                    throw new IllegalStateException("ACK timestamp disagrees.");
            }
        }

        DeliveryResult result() {
            List<MessageOutcome> outcomes = new ArrayList<>();
            List<Long> ackLatencies = new ArrayList<>(), effectLatencies = new ArrayList<>();
            int deliveries = 0,
                    redeliveries = 0,
                    effectsWithMessage = 0,
                    acknowledged = 0,
                    withoutEffect = 0,
                    dead = 0,
                    notEnqueued = 0,
                    ready = 0,
                    leased = 0;
            for (Message m : state.messages()) {
                List<LedgerEntry> entries =
                        ledger.stream().filter(e -> e.messageId().equals(m.id())).toList();
                Long first =
                        entries.isEmpty()
                                ? null
                                : entries.stream()
                                        .mapToLong(LedgerEntry::committedAtMs)
                                        .min()
                                        .orElseThrow();
                Long
                        ackLatency =
                                m.acknowledgedAtMs() == null
                                        ? null
                                        : m.acknowledgedAtMs() - m.enqueueTimeMs(),
                        effectLatency = first == null ? null : first - m.enqueueTimeMs();
                if (ackLatency != null) {
                    acknowledged++;
                    ackLatencies.add(ackLatency);
                    if (entries.isEmpty()) withoutEffect++;
                }
                if (effectLatency != null) {
                    effectsWithMessage++;
                    effectLatencies.add(effectLatency);
                }
                deliveries += m.deliveryCount();
                redeliveries += Math.max(0, m.deliveryCount() - 1);
                switch (m.status()) {
                    case DEAD_LETTERED -> dead++;
                    case NOT_ENQUEUED -> notEnqueued++;
                    case READY -> ready++;
                    case LEASED -> leased++;
                    default -> {}
                }
                outcomes.add(
                        new MessageOutcome(
                                m.id(),
                                m.status(),
                                m.deliveryCount(),
                                entries.size(),
                                m.acknowledgedAtMs(),
                                first,
                                ackLatency,
                                effectLatency));
            }
            int running =
                    (int)
                            state.attempts().stream()
                                    .filter(a -> a.effectStatus() == EffectStatus.PROCESSING)
                                    .count();
            int pendingAck =
                    (int)
                            state.attempts().stream()
                                    .filter(a -> a.ackStatus() == AckStatus.PENDING)
                                    .count();
            DeliveryMetrics metrics =
                    new DeliveryMetrics(
                            deliveries,
                            redeliveries,
                            ledger.size(),
                            effectsWithMessage,
                            ledger.size() - effectsWithMessage,
                            acknowledged,
                            reason == null ? withoutEffect : null,
                            dead,
                            notEnqueued,
                            ready,
                            leased,
                            running,
                            pendingAck,
                            input.failures().size() - reachedFailures.size(),
                            notEnqueued,
                            ackLatencies.size(),
                            mean(ackLatencies),
                            p95(ackLatencies),
                            effectLatencies.size(),
                            mean(effectLatencies),
                            p95(effectLatencies));
            List<FailureOutcome> faults = new ArrayList<>();
            for (int i = 0; i < input.failures().size(); i++) {
                var f = input.failures().get(i);
                faults.add(
                        new FailureOutcome(
                                i,
                                f.consumerId(),
                                f.action(),
                                f.timeMs(),
                                reachedFailures.contains(i)
                                        ? FailureOutcomeStatus.REACHED
                                        : FailureOutcomeStatus.UNOBSERVED));
            }
            List<LostAcknowledgmentOutcome> lossOutcomes =
                    input.lostAcknowledgments().stream()
                            .map(
                                    s -> {
                                        Attempt a =
                                                state.attempts().stream()
                                                        .filter(
                                                                t ->
                                                                        t.messageId()
                                                                                        .equals(
                                                                                                s
                                                                                                        .messageId())
                                                                                && t.attempt()
                                                                                        == s
                                                                                                .attempt())
                                                        .findFirst()
                                                        .orElse(null);
                                        LossOutcomeStatus status =
                                                reachedLosses.contains(
                                                                lossKey(s.messageId(), s.attempt()))
                                                        ? LossOutcomeStatus.REACHED
                                                        : a != null
                                                                        && a.ackStatus()
                                                                                == AckStatus
                                                                                        .CANCELLED
                                                                ? LossOutcomeStatus.ACK_CANCELLED
                                                                : reason != null
                                                                        ? LossOutcomeStatus
                                                                                .UNOBSERVED
                                                                        : LossOutcomeStatus
                                                                                .ATTEMPT_NOT_DELIVERED;
                                        return new LostAcknowledgmentOutcome(
                                                s.messageId(), s.attempt(), status);
                                    })
                            .toList();
            return new DeliveryResult(
                    DeliveryInput.SCHEMA_VERSION,
                    SIMULATION_ID,
                    MODEL_VERSION,
                    input.seed(),
                    reason == null ? "completed" : "limited",
                    reason,
                    lastTime,
                    ASSUMPTIONS,
                    initialState,
                    events,
                    state,
                    outcomes,
                    state.attempts(),
                    ledger,
                    metrics,
                    faults,
                    lossOutcomes);
        }
    }

    private static int idleConsumer(DeliveryState state) {
        for (int i = 0; i < state.consumers().size(); i++) {
            Consumer c = state.consumers().get(i);
            if (c.status() == ConsumerStatus.READY && c.currentAttemptId() == null) return i;
        }
        return -1;
    }

    private static int readyMessage(DeliveryState state) {
        int index = -1;
        for (int i = 0; i < state.messages().size(); i++) {
            Message m = state.messages().get(i);
            if (m.status() == BrokerStatus.READY
                    && (index < 0
                            || m.availableSinceMs()
                                    < state.messages().get(index).availableSinceMs())) index = i;
        }
        return index;
    }

    private static String lossKey(String id, int attempt) {
        return id + ":" + attempt;
    }

    private static Double mean(List<Long> values) {
        return values.isEmpty()
                ? null
                : values.stream().mapToLong(Long::longValue).average().orElseThrow();
    }

    private static Long p95(List<Long> values) {
        return values.isEmpty()
                ? null
                : values.stream().sorted().toList().get((95 * values.size() + 99) / 100 - 1);
    }

    private static <T> void replace(List<T> values, T updated, Function<T, String> id) {
        for (int i = 0; i < values.size(); i++)
            if (id.apply(values.get(i)).equals(id.apply(updated))) {
                values.set(i, updated);
                return;
            }
        values.add(updated);
    }

    private static <T> List<T> changed(List<T> before, List<T> after, Function<T, String> id) {
        return after.stream()
                .filter(
                        value ->
                                before.stream()
                                        .noneMatch(
                                                old ->
                                                        id.apply(old).equals(id.apply(value))
                                                                && old.equals(value)))
                .toList();
    }

    /**
     * Local conservative JSON count, including omitted nulls and worst-case escaped UTF-16 strings.
     */
    static long estimatedEventBytes(DeliveryEvent event) {
        return estimatedBytes(event);
    }

    private static long estimatedBytes(Object value) {
        if (value == null) return 4;
        if (value instanceof String text) {
            long bytes = 2;
            for (int i = 0; i < text.length(); i++) {
                char c = text.charAt(i);
                if (c == '\"' || c == '\\' || c == '\b' || c == '\f' || c == '\n' || c == '\r'
                        || c == '\t') bytes += 2;
                else bytes += c < 0x20 || c > 0x7f ? 6 : 1;
            }
            return bytes;
        }
        if (value instanceof Kind kind) return estimatedBytes(kind.value());
        if (value instanceof Enum<?> e) return estimatedBytes(e.name());
        if (value instanceof Number) return 22;
        if (value instanceof Boolean) return 5;
        if (value instanceof List<?> values)
            return 2L
                    + Math.max(0, values.size() - 1)
                    + values.stream().mapToLong(DeliverySimulator::estimatedBytes).sum();
        if (value.getClass().isRecord()) {
            RecordComponent[] fields = value.getClass().getRecordComponents();
            long bytes = 2L + Math.max(0, fields.length - 1);
            try {
                for (RecordComponent field : fields)
                    bytes +=
                            estimatedBytes(field.getName())
                                    + 1
                                    + estimatedBytes(field.getAccessor().invoke(value));
            } catch (ReflectiveOperationException e) {
                throw new IllegalStateException(
                        "Cannot estimate the immutable delivery contract.", e);
            }
            return bytes;
        }
        throw new IllegalArgumentException(
                "Unsupported delivery trace field type: " + value.getClass().getName());
    }
}
