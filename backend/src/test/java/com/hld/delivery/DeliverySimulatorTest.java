package com.hld.delivery;

import static org.assertj.core.api.Assertions.assertThat;

import com.hld.delivery.DeliveryEvent.Kind;
import com.hld.delivery.DeliveryInput.AcknowledgmentPolicy;
import com.hld.delivery.DeliveryInput.Consumer;
import com.hld.delivery.DeliveryInput.Failure;
import com.hld.delivery.DeliveryInput.FailureAction;
import com.hld.delivery.DeliveryInput.LostAcknowledgment;
import com.hld.delivery.DeliveryInput.Message;
import com.hld.delivery.DeliveryState.AckStatus;
import com.hld.delivery.DeliveryState.BrokerStatus;
import com.hld.delivery.DeliveryState.ConsumerStatus;
import com.hld.delivery.DeliveryState.EffectStatus;
import com.hld.delivery.DeliveryState.LeaseStatus;
import com.hld.simulation.engine.SimulationBudget;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;

/** Exact model-policy fixtures; no broker product, deduplication or external-provider claim. */
class DeliverySimulatorTest {
    private final DeliverySimulator simulator = new DeliverySimulator();

    record Core(
            String name,
            AcknowledgmentPolicy policy,
            List<Failure> failures,
            List<LostAcknowledgment> losses,
            int deliveries,
            List<Long> effectTimes,
            long ackAt,
            int acknowledgedWithoutEffect,
            long lastTime) {
        @Override
        public String toString() {
            return name;
        }
    }

    static Stream<Core> coreRows() {
        return Stream.of(
                new Core(
                        "baseline-after",
                        AcknowledgmentPolicy.ACK_AFTER_EFFECT,
                        List.of(),
                        List.of(),
                        1,
                        List.of(50L),
                        55,
                        0,
                        55),
                new Core(
                        "baseline-before",
                        AcknowledgmentPolicy.ACK_BEFORE_EFFECT,
                        List.of(),
                        List.of(),
                        1,
                        List.of(50L),
                        5,
                        0,
                        50),
                new Core(
                        "crash25-after",
                        AcknowledgmentPolicy.ACK_AFTER_EFFECT,
                        crash(25, 75),
                        List.of(),
                        2,
                        List.of(150L),
                        155,
                        0,
                        155),
                new Core(
                        "crash25-before",
                        AcknowledgmentPolicy.ACK_BEFORE_EFFECT,
                        crash(25, 75),
                        List.of(),
                        1,
                        List.of(),
                        5,
                        1,
                        75),
                new Core(
                        "crash52-after",
                        AcknowledgmentPolicy.ACK_AFTER_EFFECT,
                        crash(52, 102),
                        List.of(),
                        2,
                        List.of(50L, 152L),
                        157,
                        0,
                        157),
                new Core(
                        "crash52-before",
                        AcknowledgmentPolicy.ACK_BEFORE_EFFECT,
                        crash(52, 102),
                        List.of(),
                        1,
                        List.of(50L),
                        5,
                        0,
                        102),
                new Core(
                        "lost-after",
                        AcknowledgmentPolicy.ACK_AFTER_EFFECT,
                        List.of(),
                        List.of(new LostAcknowledgment("m1", 1)),
                        2,
                        List.of(50L, 150L),
                        155,
                        0,
                        155),
                new Core(
                        "lost-before",
                        AcknowledgmentPolicy.ACK_BEFORE_EFFECT,
                        List.of(),
                        List.of(new LostAcknowledgment("m1", 1)),
                        2,
                        List.of(50L, 150L),
                        105,
                        0,
                        150));
    }

    static List<Failure> crash(long crashAt, long recoverAt) {
        return List.of(
                new Failure("c1", FailureAction.CRASH, crashAt),
                new Failure("c1", FailureAction.RECOVER, recoverAt));
    }

    static DeliveryInput input(
            AcknowledgmentPolicy policy,
            long processing,
            long ack,
            long lease,
            int attempts,
            List<Message> messages,
            List<Consumer> consumers,
            List<Failure> failures,
            List<LostAcknowledgment> losses) {
        return new DeliveryInput(
                "1.0",
                "1.0.0",
                messages,
                consumers,
                processing,
                ack,
                lease,
                attempts,
                policy,
                failures,
                losses,
                7);
    }

    static DeliveryInput baseline(
            AcknowledgmentPolicy policy, List<Failure> failures, List<LostAcknowledgment> losses) {
        return input(
                policy,
                50,
                5,
                100,
                3,
                List.of(new Message("m1", 0)),
                List.of(new Consumer("c1")),
                failures,
                losses);
    }

    static DeliveryInput boundary(long lease, int consumers, List<LostAcknowledgment> losses) {
        return input(
                AcknowledgmentPolicy.ACK_AFTER_EFFECT,
                95,
                5,
                lease,
                2,
                List.of(new Message("m1", 0)),
                consumers(consumers),
                List.of(),
                losses);
    }

    static List<Consumer> consumers(int count) {
        return java.util.stream.IntStream.rangeClosed(1, count)
                .mapToObj(i -> new Consumer("c" + i))
                .toList();
    }

    static DeliverySimulator limited(int events, long virtualTime, long bytes) {
        return new DeliverySimulator(new SimulationBudget(events, virtualTime, bytes, 0));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("coreRows")
    void allEightCoreRowsSeparateDeliveriesEffectsAcknowledgmentsAndSettledLoss(Core row) {
        var input = baseline(row.policy(), row.failures(), row.losses());
        var result = simulator.run(input);
        assertThat(result.schemaVersion()).isEqualTo("1.0");
        assertThat(result.simulationId()).isEqualTo("queues-delivery");
        assertThat(result.modelVersion()).isEqualTo("1.0.0");
        assertThat(result.seed()).isEqualTo(7);
        assertThat(result.status()).isEqualTo("completed");
        assertThat(result.truncationReason()).isNull();
        assertThat(result.lastVirtualTimeMs()).isEqualTo(row.lastTime());
        assertThat(result.ledger())
                .extracting(LedgerEntry::committedAtMs)
                .containsExactlyElementsOf(row.effectTimes());
        assertThat(result.events().stream().filter(e -> e.kind() == Kind.ACK_ACCEPTED).toList())
                .extracting(DeliveryEvent::timeMs)
                .containsExactly(row.ackAt());
        assertThat(result.metrics().deliveryAttempts()).isEqualTo(row.deliveries());
        assertThat(result.metrics().redeliveries()).isEqualTo(row.deliveries() - 1);
        assertThat(result.metrics().committedEffects()).isEqualTo(row.effectTimes().size());
        assertThat(result.metrics().extraEffects())
                .isEqualTo(Math.max(0, row.effectTimes().size() - 1));
        assertThat(result.metrics().acknowledgedMessages()).isEqualTo(1);
        assertThat(result.metrics().acknowledgedWithoutEffect())
                .isEqualTo(row.acknowledgedWithoutEffect());
        assertThat(result.metrics().deadLetteredMessages()).isZero();
        assertThat(result.metrics().ackLatencySamples()).isEqualTo(1);
        assertThat(result.metrics().meanAckLatencyMs()).isEqualTo((double) row.ackAt());
        assertThat(result.metrics().p95AckLatencyMs()).isEqualTo(row.ackAt());
        assertThat(result.metrics().effectLatencySamples())
                .isEqualTo(row.effectTimes().isEmpty() ? 0 : 1);
        assertThat(result.metrics().meanFirstEffectLatencyMs())
                .isEqualTo(
                        row.effectTimes().isEmpty()
                                ? null
                                : row.effectTimes().get(0).doubleValue());
        assertThat(result.metrics().p95FirstEffectLatencyMs())
                .isEqualTo(row.effectTimes().isEmpty() ? null : row.effectTimes().get(0));
        assertThat(result.messageOutcomes()).hasSize(1);
        var outcome = result.messageOutcomes().get(0);
        assertThat(outcome.messageId()).isEqualTo("m1");
        assertThat(outcome.status()).isEqualTo(BrokerStatus.ACKNOWLEDGED);
        assertThat(outcome.deliveries()).isEqualTo(row.deliveries());
        assertThat(outcome.committedEffects()).isEqualTo(row.effectTimes().size());
        assertThat(outcome.acknowledgedAtMs()).isEqualTo(row.ackAt());
        assertThat(result.failureOutcomes()).hasSize(row.failures().size());
        assertThat(result.failureOutcomes())
                .allSatisfy(failure -> assertThat(failure.status().name()).isEqualTo("REACHED"));
        assertThat(result.lostAcknowledgmentOutcomes()).hasSize(row.losses().size());
        assertThat(result.lostAcknowledgmentOutcomes())
                .allSatisfy(loss -> assertThat(loss.status().name()).isEqualTo("REACHED"));
        assertThat(result.metrics().pendingFailureActions()).isZero();
        assertThat(result.metrics().pendingAcknowledgments()).isZero();
        assertThat(result.metrics().runningEffects()).isZero();
        assertReplay(result);
    }

    @Test
    void receiptAtLeaseDeadlineIsStaleAndDeadLetteringDoesNotEraseEffects() {
        var result = simulator.run(boundary(100, 1, List.of()));
        assertThat(result.status()).isEqualTo("completed");
        assertThat(result.ledger())
                .extracting(LedgerEntry::committedAtMs)
                .containsExactly(95L, 195L);
        assertThat(atTime(result, 100))
                .extracting(DeliveryEvent::kind)
                .containsExactly(
                        Kind.LEASE_EXPIRED,
                        Kind.MESSAGE_REQUEUED,
                        Kind.ACK_SENT,
                        Kind.ACK_STALE,
                        Kind.DELIVERY_STARTED);
        assertThat(atTime(result, 200))
                .extracting(DeliveryEvent::kind)
                .containsExactly(
                        Kind.LEASE_EXPIRED,
                        Kind.MESSAGE_DEAD_LETTERED,
                        Kind.ACK_SENT,
                        Kind.ACK_STALE);
        assertThat(result.metrics().deliveryAttempts()).isEqualTo(2);
        assertThat(result.metrics().committedEffects()).isEqualTo(2);
        assertThat(result.metrics().extraEffects()).isEqualTo(1);
        assertThat(result.metrics().acknowledgedMessages()).isZero();
        assertThat(result.metrics().ackLatencySamples()).isZero();
        assertThat(result.metrics().meanAckLatencyMs()).isNull();
        assertThat(result.metrics().p95AckLatencyMs()).isNull();
        assertThat(result.metrics().deadLetteredMessages()).isEqualTo(1);
        assertThat(result.finalState().messages().get(0).status())
                .isEqualTo(BrokerStatus.DEAD_LETTERED);
        assertThat(result.attemptOutcomes())
                .allSatisfy(
                        attempt -> {
                            assertThat(attempt.leaseStatus()).isEqualTo(LeaseStatus.EXPIRED);
                            assertThat(attempt.effectStatus()).isEqualTo(EffectStatus.COMMITTED);
                            assertThat(attempt.ackStatus()).isEqualTo(AckStatus.STALE);
                        });
        assertReplay(result);
    }

    @Test
    void oneMoreMillisecondAcceptsTheAckAndPrunesItsInvalidExpiryBeforeTimeGuard() {
        var result = limited(100, 100, 100_000).run(boundary(101, 1, List.of()));
        assertThat(result.status()).isEqualTo("completed");
        assertThat(result.lastVirtualTimeMs()).isEqualTo(100);
        assertThat(result.metrics().deliveryAttempts()).isEqualTo(1);
        assertThat(result.ledger()).extracting(LedgerEntry::committedAtMs).containsExactly(95L);
        assertThat(result.events()).noneMatch(event -> event.kind() == Kind.LEASE_EXPIRED);
        assertThat(result.attemptOutcomes().get(0).ackStatus()).isEqualTo(AckStatus.ACCEPTED);
        assertReplay(result);
    }

    @Test
    void effectAtCrashTieSurvivesWhereThePreviousMillisecondCancelsIt() {
        for (long crashAt : List.of(49L, 50L)) {
            var result =
                    simulator.run(
                            baseline(
                                    AcknowledgmentPolicy.ACK_AFTER_EFFECT,
                                    crash(crashAt, 75),
                                    List.of()));
            assertThat(result.ledger())
                    .extracting(LedgerEntry::committedAtMs)
                    .containsExactlyElementsOf(crashAt == 49 ? List.of(150L) : List.of(50L, 150L));
            assertThat(
                            result.events().stream()
                                    .filter(event -> event.kind() == Kind.ACK_ACCEPTED)
                                    .toList())
                    .extracting(DeliveryEvent::timeMs)
                    .containsExactly(155L);
            var first = result.attemptOutcomes().get(0);
            assertThat(first.effectStatus())
                    .isEqualTo(crashAt == 49 ? EffectStatus.CANCELLED : EffectStatus.COMMITTED);
            assertThat(first.ackStatus()).isEqualTo(AckStatus.CANCELLED);
            if (crashAt == 50)
                assertThat(atTime(result, 50))
                        .extracting(DeliveryEvent::kind)
                        .containsExactly(
                                Kind.EFFECT_COMMITTED,
                                Kind.CONSUMER_CRASHED,
                                Kind.ATTEMPT_CANCELLED);
            assertReplay(result);
        }
    }

    @Test
    void exhaustedAttemptCrashesBeforeEffectAndDeadLettersOnlyAtExpiry() {
        var result =
                simulator.run(
                        input(
                                AcknowledgmentPolicy.ACK_AFTER_EFFECT,
                                50,
                                5,
                                100,
                                1,
                                List.of(new Message("m1", 0)),
                                consumers(1),
                                crash(25, 75),
                                List.of(new LostAcknowledgment("m1", 1))));
        assertThat(result.status()).isEqualTo("completed");
        assertThat(result.lastVirtualTimeMs()).isEqualTo(100);
        assertThat(result.metrics().deliveryAttempts()).isEqualTo(1);
        assertThat(result.ledger()).isEmpty();
        assertThat(
                        result.events().stream()
                                .filter(event -> event.kind() == Kind.MESSAGE_DEAD_LETTERED)
                                .toList())
                .extracting(DeliveryEvent::timeMs)
                .containsExactly(100L);
        assertThat(result.lostAcknowledgmentOutcomes().get(0).status().name())
                .isEqualTo("ACK_CANCELLED");
        assertReplay(result);
    }

    @Test
    void crashAtZeroWithNoRecoveryIsAHonestStallAfterEnqueue() {
        var result =
                simulator.run(
                        baseline(
                                AcknowledgmentPolicy.ACK_AFTER_EFFECT,
                                List.of(new Failure("c1", FailureAction.CRASH, 0)),
                                List.of(new LostAcknowledgment("m1", 1))));
        assertThat(result.status()).isEqualTo("limited");
        assertThat(result.truncationReason()).isEqualTo("no_future_progress");
        assertThat(result.lastVirtualTimeMs()).isZero();
        assertThat(result.events())
                .extracting(DeliveryEvent::kind)
                .containsExactly(Kind.CONSUMER_CRASHED, Kind.MESSAGE_ENQUEUED);
        assertThat(result.metrics().deliveryAttempts()).isZero();
        assertThat(result.metrics().ready()).isEqualTo(1);
        assertThat(result.metrics().leased()).isZero();
        assertThat(result.metrics().acknowledgedWithoutEffect()).isNull();
        assertThat(result.metrics().pendingFailureActions()).isZero();
        assertThat(result.metrics().pendingEnqueues()).isZero();
        assertThat(result.ledger()).isEmpty();
        assertThat(result.lostAcknowledgmentOutcomes().get(0).status().name())
                .isEqualTo("UNOBSERVED");
        assertReplay(result);
    }

    @Test
    void expiredAttemptsOverlapAndADeadLetteredMessageStillGetsALateEffect() {
        var result =
                simulator.run(
                        input(
                                AcknowledgmentPolicy.ACK_AFTER_EFFECT,
                                150,
                                5,
                                100,
                                2,
                                List.of(new Message("m1", 0)),
                                consumers(2),
                                List.of(),
                                List.of()));
        assertThat(result.status()).isEqualTo("completed");
        assertThat(result.lastVirtualTimeMs()).isEqualTo(255);
        assertThat(result.ledger())
                .extracting(LedgerEntry::committedAtMs)
                .containsExactly(150L, 250L);
        assertThat(result.ledger()).extracting(LedgerEntry::consumerId).containsExactly("c1", "c2");
        var secondStart =
                result.events().stream()
                        .filter(e -> e.kind() == Kind.DELIVERY_STARTED && e.timeMs() == 100)
                        .findFirst()
                        .orElseThrow();
        var overlap = replayThrough(result, secondStart.sequence());
        assertThat(overlap.attempts())
                .extracting(DeliveryState.Attempt::effectStatus)
                .containsExactly(EffectStatus.PROCESSING, EffectStatus.PROCESSING);
        assertThat(overlap.attempts())
                .extracting(DeliveryState.Attempt::leaseStatus)
                .containsExactly(LeaseStatus.EXPIRED, LeaseStatus.ACTIVE);
        assertThat(overlap.consumers())
                .extracting(DeliveryState.Consumer::currentAttemptId)
                .containsExactly("m1-a1", "m1-a2");
        var deadLetter =
                result.events().stream()
                        .filter(e -> e.kind() == Kind.MESSAGE_DEAD_LETTERED)
                        .findFirst()
                        .orElseThrow();
        assertThat(deadLetter.timeMs()).isEqualTo(200);
        var afterDeadLetter = replayThrough(result, deadLetter.sequence());
        assertThat(afterDeadLetter.messages().get(0).status())
                .isEqualTo(BrokerStatus.DEAD_LETTERED);
        assertThat(afterDeadLetter.attempts().get(1).effectStatus())
                .isEqualTo(EffectStatus.PROCESSING);
        assertThat(result.metrics().committedEffects()).isEqualTo(2);
        assertThat(result.metrics().extraEffects()).isEqualTo(1);
        assertThat(result.metrics().deadLetteredMessages()).isEqualTo(1);
        assertThat(result.metrics().acknowledgedMessages()).isZero();
        assertReplay(result);
    }

    @Test
    void configuredTransportLossWinsOverStaleReceiptAtTheSameDeadline() {
        var result = simulator.run(boundary(100, 1, List.of(new LostAcknowledgment("m1", 1))));
        assertThat(atTime(result, 100))
                .extracting(DeliveryEvent::kind)
                .containsExactly(
                        Kind.LEASE_EXPIRED,
                        Kind.MESSAGE_REQUEUED,
                        Kind.ACK_SENT,
                        Kind.ACK_LOST,
                        Kind.DELIVERY_STARTED);
        assertThat(result.attemptOutcomes().get(0).ackStatus()).isEqualTo(AckStatus.LOST);
        assertThat(result.attemptOutcomes().get(1).ackStatus()).isEqualTo(AckStatus.STALE);
        assertThat(
                        result.events().stream()
                                .filter(event -> event.kind() == Kind.ACK_STALE)
                                .toList())
                .extracting(DeliveryEvent::attemptId)
                .containsExactly("m1-a2");
        assertThat(result.lostAcknowledgmentOutcomes().get(0).status().name()).isEqualTo("REACHED");
        assertReplay(result);
    }

    @Test
    void acceptedEarlyAckDoesNotProvePermanentEffectLossInALimitedPrefix() {
        var input = baseline(AcknowledgmentPolicy.ACK_BEFORE_EFFECT, List.of(), List.of());
        var result = limited(100, 10, 100_000).run(input);
        assertThat(result.status()).isEqualTo("limited");
        assertThat(result.truncationReason()).isEqualTo("virtual_time_limit");
        assertThat(result.lastVirtualTimeMs()).isEqualTo(5);
        assertThat(result.metrics().acknowledgedMessages()).isEqualTo(1);
        assertThat(result.metrics().acknowledgedWithoutEffect()).isNull();
        assertThat(result.metrics().runningEffects()).isEqualTo(1);
        assertThat(result.metrics().pendingAcknowledgments()).isZero();
        assertThat(result.metrics().effectLatencySamples()).isZero();
        assertThat(result.metrics().meanFirstEffectLatencyMs()).isNull();
        assertThat(result.ledger()).isEmpty();
        assertThat(result.attemptOutcomes().get(0).effectStatus())
                .isEqualTo(EffectStatus.PROCESSING);
        assertThat(limited(100, 50, 100_000).run(input).status()).isEqualTo("completed");
        assertReplay(result);
    }

    @Test
    void limitedPrefixReportsUnreachedFaultsAndSelectorsInsteadOfClaimingTheyNeverExist() {
        var input =
                baseline(
                        AcknowledgmentPolicy.ACK_AFTER_EFFECT,
                        crash(60, 80),
                        List.of(new LostAcknowledgment("m1", 3)));
        var result = limited(100, 40, 100_000).run(input);
        assertThat(result.metrics().pendingFailureActions()).isEqualTo(2);
        assertThat(result.failureOutcomes())
                .allSatisfy(f -> assertThat(f.status().name()).isEqualTo("UNOBSERVED"));
        assertThat(result.lostAcknowledgmentOutcomes().get(0).status().name())
                .isEqualTo("UNOBSERVED");
        var settled = simulator.run(input);
        assertThat(settled.lastVirtualTimeMs()).isEqualTo(80);
        assertThat(settled.failureOutcomes())
                .allSatisfy(f -> assertThat(f.status().name()).isEqualTo("REACHED"));
        assertThat(settled.lostAcknowledgmentOutcomes().get(0).status().name())
                .isEqualTo("ATTEMPT_NOT_DELIVERED");
        assertReplay(result);
        assertReplay(settled);
    }

    @Test
    void eventBudgetNeverSplitsAcknowledgmentExpiryOrCrashBatches() {
        var baseline = baseline(AcknowledgmentPolicy.ACK_AFTER_EFFECT, List.of(), List.of());
        var ack = limited(4, 60_000, 100_000).run(baseline);
        assertThat(ack.events())
                .extracting(DeliveryEvent::kind)
                .containsExactly(
                        Kind.MESSAGE_ENQUEUED, Kind.DELIVERY_STARTED, Kind.EFFECT_COMMITTED);
        assertThat(ack.lastVirtualTimeMs()).isEqualTo(50);
        assertThat(ack.attemptOutcomes().get(0).ackStatus()).isEqualTo(AckStatus.PENDING);
        assertThat(ack.metrics().acknowledgedMessages()).isZero();
        assertThat(ack.metrics().pendingAcknowledgments()).isEqualTo(1);
        assertThat(limited(5, 60_000, 100_000).run(baseline).status()).isEqualTo("completed");
        var expiry = limited(4, 60_000, 100_000).run(boundary(100, 1, List.of()));
        assertThat(expiry.events()).hasSize(3);
        assertThat(expiry.lastVirtualTimeMs()).isEqualTo(95);
        assertThat(expiry.finalState().messages().get(0).status()).isEqualTo(BrokerStatus.LEASED);
        assertThat(expiry.attemptOutcomes().get(0).leaseStatus()).isEqualTo(LeaseStatus.ACTIVE);
        var crash =
                limited(3, 60_000, 100_000)
                        .run(
                                baseline(
                                        AcknowledgmentPolicy.ACK_AFTER_EFFECT,
                                        crash(25, 75),
                                        List.of()));
        assertThat(crash.events()).hasSize(2);
        assertThat(crash.finalState().consumers().get(0).status()).isEqualTo(ConsumerStatus.READY);
        assertThat(crash.attemptOutcomes().get(0).effectStatus())
                .isEqualTo(EffectStatus.PROCESSING);
        assertThat(crash.failureOutcomes())
                .allSatisfy(f -> assertThat(f.status().name()).isEqualTo("UNOBSERVED"));
        for (var result : List.of(ack, expiry, crash)) {
            assertThat(result.status()).isEqualTo("limited");
            assertThat(result.truncationReason()).isEqualTo("event_limit");
            assertThat(result.metrics().acknowledgedWithoutEffect()).isNull();
            assertReplay(result);
        }
    }

    @Test
    void byteAdmissionLeavesAllStateAndLedgerAtTheLastCompleteAtomicPrefix() {
        var input = baseline(AcknowledgmentPolicy.ACK_AFTER_EFFECT, List.of(), List.of());
        var full = simulator.run(input);
        long firstThreeBytes = 2;
        for (int i = 0; i < 3; i++)
            firstThreeBytes +=
                    DeliverySimulator.estimatedEventBytes(full.events().get(i)) + (i == 0 ? 0 : 1);
        var result = limited(100, 60_000, firstThreeBytes).run(input);
        assertThat(result.status()).isEqualTo("limited");
        assertThat(result.truncationReason()).isEqualTo("trace_size_limit");
        assertThat(result.events()).containsExactlyElementsOf(full.events().subList(0, 3));
        assertThat(result.ledger()).hasSize(1);
        assertThat(result.attemptOutcomes().get(0).effectStatus())
                .isEqualTo(EffectStatus.COMMITTED);
        assertThat(result.attemptOutcomes().get(0).ackStatus()).isEqualTo(AckStatus.PENDING);
        assertThat(result.finalState().messages().get(0).status()).isEqualTo(BrokerStatus.LEASED);
        assertReplay(result);
        var empty = limited(100, 60_000, 2).run(input);
        assertThat(empty.events()).isEmpty();
        assertThat(empty.ledger()).isEmpty();
        assertThat(empty.finalState()).isEqualTo(empty.initialState());
        assertThat(empty.metrics().notEnqueued()).isEqualTo(1);
        assertThat(empty.metrics().pendingEnqueues()).isEqualTo(1);
        assertReplay(empty);
    }

    @Test
    void arbitraryInputOrderKeepsChronologicalSchedulingAndDeclaredDispatchTies() {
        var input =
                input(
                        AcknowledgmentPolicy.ACK_AFTER_EFFECT,
                        50,
                        5,
                        100,
                        3,
                        List.of(new Message("m2", 10), new Message("m1", 0), new Message("m3", 10)),
                        List.of(new Consumer("c2"), new Consumer("c1")),
                        List.of(),
                        List.of());
        var result = simulator.run(input);
        assertThat(result.events().stream().filter(e -> e.kind() == Kind.DELIVERY_STARTED).toList())
                .extracting(e -> e.messageId() + "/" + e.consumerId() + "@" + e.timeMs())
                .containsExactly("m1/c2@0", "m2/c1@10", "m3/c2@50");
        assertThat(result.messageOutcomes())
                .extracting(DeliveryResult.MessageOutcome::messageId)
                .containsExactly("m2", "m1", "m3");
        assertReplay(result);
        var unsortedFailures =
                List.of(
                        new Failure("c1", FailureAction.RECOVER, 75),
                        new Failure("c1", FailureAction.CRASH, 0));
        var recovered =
                simulator.run(
                        input(
                                AcknowledgmentPolicy.ACK_AFTER_EFFECT,
                                50,
                                5,
                                100,
                                3,
                                List.of(new Message("m1", 75)),
                                consumers(1),
                                unsortedFailures,
                                List.of()));
        assertThat(atTime(recovered, 75))
                .extracting(DeliveryEvent::kind)
                .containsExactly(
                        Kind.CONSUMER_RECOVERED, Kind.MESSAGE_ENQUEUED, Kind.DELIVERY_STARTED);
        assertThat(recovered.failureOutcomes())
                .extracting(DeliveryResult.FailureOutcome::index)
                .containsExactly(0, 1);
        assertThat(recovered.failureOutcomes())
                .extracting(DeliveryResult.FailureOutcome::action)
                .containsExactly(FailureAction.RECOVER, FailureAction.CRASH);
        assertReplay(recovered);
    }

    @Test
    void aCrashCancelsEveryPendingLocalAckAfterProcessingSlotsHaveBeenReleased() {
        var result =
                simulator.run(
                        input(
                                AcknowledgmentPolicy.ACK_AFTER_EFFECT,
                                1,
                                10,
                                100,
                                1,
                                List.of(
                                        new Message("m1", 0),
                                        new Message("m2", 0),
                                        new Message("m3", 0)),
                                consumers(1),
                                List.of(new Failure("c1", FailureAction.CRASH, 4)),
                                List.of()));
        assertThat(result.status()).isEqualTo("completed");
        assertThat(result.lastVirtualTimeMs()).isEqualTo(102);
        assertThat(result.ledger())
                .extracting(LedgerEntry::committedAtMs)
                .containsExactly(1L, 2L, 3L);
        assertThat(
                        result.events().stream()
                                .filter(e -> e.kind() == Kind.ATTEMPT_CANCELLED)
                                .toList())
                .extracting(DeliveryEvent::attemptId)
                .containsExactly("m1-a1", "m2-a1", "m3-a1");
        assertThat(result.events())
                .noneMatch(e -> e.kind() == Kind.ACK_SENT || e.kind() == Kind.ACK_ACCEPTED);
        assertThat(
                        result.events().stream()
                                .filter(e -> e.kind() == Kind.MESSAGE_DEAD_LETTERED)
                                .toList())
                .extracting(DeliveryEvent::timeMs)
                .containsExactly(100L, 101L, 102L);
        assertThat(result.attemptOutcomes())
                .allSatisfy(
                        attempt -> {
                            assertThat(attempt.effectStatus()).isEqualTo(EffectStatus.COMMITTED);
                            assertThat(attempt.ackStatus()).isEqualTo(AckStatus.CANCELLED);
                            assertThat(attempt.ackSentAtMs()).isNull();
                        });
        assertThat(result.metrics().deadLetteredMessages()).isEqualTo(3);
        assertThat(result.metrics().pendingAcknowledgments()).isZero();
        assertReplay(result);
    }

    @Test
    void downConsumerDrainsValidLeaseTimersBeforeClassifyingRemainingReadyWorkAsStalled() {
        var result =
                simulator.run(
                        input(
                                AcknowledgmentPolicy.ACK_AFTER_EFFECT,
                                1,
                                10,
                                100,
                                1,
                                List.of(
                                        new Message("m1", 0),
                                        new Message("m2", 0),
                                        new Message("m3", 0)),
                                consumers(1),
                                List.of(new Failure("c1", FailureAction.CRASH, 2)),
                                List.of()));
        assertThat(result.status()).isEqualTo("limited");
        assertThat(result.truncationReason()).isEqualTo("no_future_progress");
        assertThat(result.lastVirtualTimeMs()).isEqualTo(101);
        assertThat(result.ledger()).extracting(LedgerEntry::committedAtMs).containsExactly(1L, 2L);
        assertThat(atTime(result, 2))
                .extracting(DeliveryEvent::kind)
                .containsExactly(
                        Kind.EFFECT_COMMITTED,
                        Kind.CONSUMER_CRASHED,
                        Kind.ATTEMPT_CANCELLED,
                        Kind.ATTEMPT_CANCELLED);
        assertThat(
                        result.events().stream()
                                .filter(e -> e.kind() == Kind.MESSAGE_DEAD_LETTERED)
                                .toList())
                .extracting(DeliveryEvent::timeMs)
                .containsExactly(100L, 101L);
        assertThat(result.messageOutcomes())
                .extracting(DeliveryResult.MessageOutcome::status)
                .containsExactly(
                        BrokerStatus.DEAD_LETTERED, BrokerStatus.DEAD_LETTERED, BrokerStatus.READY);
        assertThat(result.metrics().deliveryAttempts()).isEqualTo(2);
        assertThat(result.metrics().ready()).isEqualTo(1);
        assertThat(result.metrics().leased()).isZero();
        assertThat(result.metrics().pendingAcknowledgments()).isZero();
        assertReplay(result);
    }

    @Test
    void repeatedAndSimultaneousCallsOnOneSimulatorCannotShareExecutionState() throws Exception {
        var duplicated =
                baseline(
                        AcknowledgmentPolicy.ACK_AFTER_EFFECT,
                        List.of(),
                        List.of(new LostAcknowledgment("m1", 1)));
        var lost = baseline(AcknowledgmentPolicy.ACK_BEFORE_EFFECT, crash(25, 75), List.of());
        var duplicatedResult = simulator.run(duplicated);
        var lostResult = simulator.run(lost);
        assertThat(duplicatedResult.metrics().committedEffects()).isEqualTo(2);
        assertThat(lostResult.metrics().acknowledgedWithoutEffect()).isEqualTo(1);
        assertThat(simulator.run(duplicated)).isEqualTo(duplicatedResult);
        assertThat(simulator.run(lost)).isEqualTo(lostResult);
        var ready = new CountDownLatch(4);
        var start = new CountDownLatch(1);
        var pool = Executors.newFixedThreadPool(4);
        try {
            var futures = new ArrayList<java.util.concurrent.Future<DeliveryResult>>();
            for (int index = 0; index < 12; index++) {
                final boolean useDuplicate = index % 2 == 0;
                futures.add(
                        pool.submit(
                                () -> {
                                    ready.countDown();
                                    start.await();
                                    return simulator.run(useDuplicate ? duplicated : lost);
                                }));
            }
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            for (int index = 0; index < futures.size(); index++) {
                var result = futures.get(index).get(5, TimeUnit.SECONDS);
                assertThat(result).isEqualTo(index % 2 == 0 ? duplicatedResult : lostResult);
                assertReplay(result);
            }
        } finally {
            start.countDown();
            pool.shutdownNow();
        }
    }

    private static List<DeliveryEvent> atTime(DeliveryResult result, long time) {
        return result.events().stream().filter(event -> event.timeMs() == time).toList();
    }

    private static DeliveryState replayThrough(DeliveryResult result, int sequence) {
        Map<String, DeliveryState.Message> messages = new LinkedHashMap<>();
        Map<String, DeliveryState.Consumer> consumers = new LinkedHashMap<>();
        Map<String, DeliveryState.Attempt> attempts = new LinkedHashMap<>();
        result.initialState().messages().forEach(message -> messages.put(message.id(), message));
        result.initialState()
                .consumers()
                .forEach(consumer -> consumers.put(consumer.id(), consumer));
        result.initialState().attempts().forEach(attempt -> attempts.put(attempt.id(), attempt));
        for (var event : result.events()) {
            if (event.sequence() > sequence) break;
            assertThat(event.changes()).isNotNull();
            assertThat(event.changes().messages())
                    .extracting(DeliveryState.Message::id)
                    .doesNotHaveDuplicates();
            assertThat(event.changes().consumers())
                    .extracting(DeliveryState.Consumer::id)
                    .doesNotHaveDuplicates();
            assertThat(event.changes().attempts())
                    .extracting(DeliveryState.Attempt::id)
                    .doesNotHaveDuplicates();
            event.changes()
                    .messages()
                    .forEach(
                            message -> {
                                assertThat(messages).containsKey(message.id());
                                assertThat(message).isNotEqualTo(messages.get(message.id()));
                                messages.put(message.id(), message);
                            });
            event.changes()
                    .consumers()
                    .forEach(
                            consumer -> {
                                assertThat(consumers).containsKey(consumer.id());
                                assertThat(consumer).isNotEqualTo(consumers.get(consumer.id()));
                                consumers.put(consumer.id(), consumer);
                            });
            event.changes()
                    .attempts()
                    .forEach(
                            attempt -> {
                                assertThat(attempt).isNotEqualTo(attempts.get(attempt.id()));
                                attempts.put(attempt.id(), attempt);
                            });
        }
        return new DeliveryState(
                List.copyOf(messages.values()),
                List.copyOf(consumers.values()),
                List.copyOf(attempts.values()));
    }

    /**
     * Independent application of admitted post-event deltas; no scheduler behavior is recreated.
     */
    private static void assertReplay(DeliveryResult result) {
        assertThat(replayThrough(result, result.events().size())).isEqualTo(result.finalState());
        assertThat(result.attemptOutcomes())
                .containsExactlyElementsOf(result.finalState().attempts());
        long previousTime = 0;
        var ledger = new ArrayList<LedgerEntry>();
        for (int index = 0; index < result.events().size(); index++) {
            var event = result.events().get(index);
            assertThat(event.sequence()).isEqualTo(index + 1);
            assertThat(event.timeMs()).isBetween(previousTime, result.lastVirtualTimeMs());
            previousTime = event.timeMs();
            if (event.kind() == Kind.EFFECT_COMMITTED) {
                assertThat(event.ledgerEntry()).isNotNull();
                assertThat(event.ledgerEntry().id()).isEqualTo(event.attemptId() + "-effect");
                assertThat(event.ledgerEntry().messageId()).isEqualTo(event.messageId());
                assertThat(event.ledgerEntry().consumerId()).isEqualTo(event.consumerId());
                assertThat(event.ledgerEntry().committedAtMs()).isEqualTo(event.timeMs());
                ledger.add(event.ledgerEntry());
            } else assertThat(event.ledgerEntry()).isNull();
        }
        assertThat(ledger).containsExactlyElementsOf(result.ledger());
        assertThat(ledger).extracting(LedgerEntry::id).doesNotHaveDuplicates();
        assertThat(result.metrics().committedEffects()).isEqualTo(ledger.size());
        assertThat(result.metrics().deliveryAttempts())
                .isEqualTo(result.finalState().attempts().size());
        assertThat(result.metrics().notEnqueued())
                .isEqualTo(
                        (int)
                                result.finalState().messages().stream()
                                        .filter(m -> m.status() == BrokerStatus.NOT_ENQUEUED)
                                        .count());
        assertThat(result.metrics().ready())
                .isEqualTo(
                        (int)
                                result.finalState().messages().stream()
                                        .filter(m -> m.status() == BrokerStatus.READY)
                                        .count());
        assertThat(result.metrics().leased())
                .isEqualTo(
                        (int)
                                result.finalState().messages().stream()
                                        .filter(m -> m.status() == BrokerStatus.LEASED)
                                        .count());
        assertThat(result.metrics().runningEffects())
                .isEqualTo(
                        (int)
                                result.finalState().attempts().stream()
                                        .filter(a -> a.effectStatus() == EffectStatus.PROCESSING)
                                        .count());
        assertThat(result.metrics().pendingAcknowledgments())
                .isEqualTo(
                        (int)
                                result.finalState().attempts().stream()
                                        .filter(a -> a.ackStatus() == AckStatus.PENDING)
                                        .count());
        assertThat(result.metrics().acknowledgedMessages())
                .isEqualTo(
                        (int)
                                result.finalState().messages().stream()
                                        .filter(m -> m.status() == BrokerStatus.ACKNOWLEDGED)
                                        .count());
        assertThat(result.metrics().deadLetteredMessages())
                .isEqualTo(
                        (int)
                                result.finalState().messages().stream()
                                        .filter(m -> m.status() == BrokerStatus.DEAD_LETTERED)
                                        .count());
        if (!result.events().isEmpty())
            assertThat(result.lastVirtualTimeMs()).isEqualTo(previousTime);
        if ("limited".equals(result.status()))
            assertThat(result.metrics().acknowledgedWithoutEffect()).isNull();
    }
}
