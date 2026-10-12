package com.hld.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.hld.catalog.CatalogService;
import com.hld.catalog.GuidedCheckpoint;
import com.hld.delivery.DeliveryDescriptor.Preset;
import com.hld.delivery.DeliveryEvent;
import com.hld.delivery.DeliveryEvent.Kind;
import com.hld.delivery.DeliveryInput;
import com.hld.delivery.DeliveryResult;
import com.hld.delivery.DeliverySimulator;
import com.hld.delivery.DeliveryState;
import com.hld.delivery.DeliveryState.AckStatus;
import com.hld.delivery.DeliveryState.BrokerStatus;
import com.hld.delivery.DeliveryState.ConsumerStatus;
import com.hld.delivery.DeliveryState.EffectStatus;
import com.hld.delivery.DeliveryState.LeaseStatus;
import com.hld.delivery.LedgerEntry;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import tools.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Each authored claim resolves to a real Java event and the world actually observed there. */
@SpringBootTest
class DeliveryGuidedCheckpointsTest {
    @Autowired CatalogService catalog;
    @Autowired DeliveryController controller;
    @Autowired DeliverySimulator simulator;
    @Autowired ObjectMapper mapper;

    record Observed(DeliveryState state, List<LedgerEntry> ledger) {}

    record Resolved(
            GuidedCheckpoint checkpoint,
            Preset preset,
            DeliveryResult result,
            DeliveryEvent event,
            Observed observed) {}

    private Resolved resolve(String id, String presetId, String attemptId, Kind kind, long time) {
        var checkpoint =
                catalog.draftTopic("queues-delivery").checkpoints().stream()
                        .filter(candidate -> candidate.id().equals(id))
                        .findFirst()
                        .orElseThrow();
        assertThat(checkpoint.simulationId()).isEqualTo("queues-delivery");
        assertThat(checkpoint.presetId()).isEqualTo(presetId);
        var target = checkpoint.target();
        assertThat(target.operation()).isNull();
        assertThat(target.jobId()).isNull();
        assertThat(target.messageId()).isEqualTo("m1");
        assertThat(target.attemptId()).isEqualTo(attemptId);
        assertThat(target.kind()).isEqualTo(kind.value());
        assertThat(target.occurrence()).isEqualTo(1);
        var preset =
                controller.descriptor().presets().stream()
                        .filter(candidate -> candidate.id().equals(checkpoint.presetId()))
                        .findFirst()
                        .orElseThrow();
        var result = simulator.run(preset.input());
        assertThat(result.modelVersion()).isEqualTo("1.0.0");
        assertThat(result.status())
                .isEqualTo(presetId.equals("virtual-limit") ? "limited" : "completed");
        var matches =
                result.events().stream()
                        .filter(
                                event ->
                                        target.messageId().equals(event.messageId())
                                                && target.attemptId().equals(event.attemptId())
                                                && target.kind().equals(event.kind().value()))
                        .toList();
        assertThat(matches).as(id + " semantic target").hasSize(1);
        var event = matches.get(target.occurrence() - 1);
        assertThat(event.timeMs()).isEqualTo(time);
        var completeReplay = replayThrough(result, Integer.MAX_VALUE);
        assertThat(completeReplay.state()).isEqualTo(result.finalState());
        assertThat(completeReplay.ledger()).containsExactlyElementsOf(result.ledger());
        return new Resolved(
                checkpoint, preset, result, event, replayThrough(result, event.sequence()));
    }

    /** Apply all preceding full-record replacements; no modeled transition is recomputed. */
    private static Observed replayThrough(DeliveryResult result, int sequence) {
        Map<String, DeliveryState.Message> messages = new LinkedHashMap<>();
        Map<String, DeliveryState.Consumer> consumers = new LinkedHashMap<>();
        Map<String, DeliveryState.Attempt> attempts = new LinkedHashMap<>();
        var ledger = new ArrayList<LedgerEntry>();
        result.initialState().messages().forEach(message -> messages.put(message.id(), message));
        result.initialState()
                .consumers()
                .forEach(consumer -> consumers.put(consumer.id(), consumer));
        result.initialState().attempts().forEach(attempt -> attempts.put(attempt.id(), attempt));
        for (var event : result.events()) {
            if (event.sequence() > sequence) break;
            event.changes().messages().forEach(message -> messages.put(message.id(), message));
            event.changes().consumers().forEach(consumer -> consumers.put(consumer.id(), consumer));
            event.changes().attempts().forEach(attempt -> attempts.put(attempt.id(), attempt));
            if (event.ledgerEntry() != null) ledger.add(event.ledgerEntry());
        }
        return new Observed(
                new DeliveryState(
                        List.copyOf(messages.values()),
                        List.copyOf(consumers.values()),
                        List.copyOf(attempts.values())),
                List.copyOf(ledger));
    }

    private static DeliveryState.Message message(Resolved r) {
        return r.observed().state().messages().stream()
                .filter(message -> message.id().equals("m1"))
                .findFirst()
                .orElseThrow();
    }

    private static DeliveryState.Consumer consumer(Resolved r, String id) {
        return r.observed().state().consumers().stream()
                .filter(consumer -> consumer.id().equals(id))
                .findFirst()
                .orElseThrow();
    }

    private static DeliveryState.Attempt attempt(Resolved r) {
        return r.observed().state().attempts().stream()
                .filter(attempt -> attempt.id().equals(r.event().attemptId()))
                .findFirst()
                .orElseThrow();
    }

    @Test
    void aCommittedEffectDoesNotAcknowledgeTheBrokerOrKeepTheProcessingSlotBusy() {
        var r =
                resolve(
                        "effect-before-confirmation",
                        "baseline",
                        "m1-a1",
                        Kind.EFFECT_COMMITTED,
                        50);
        assertThat(r.observed().ledger())
                .extracting(LedgerEntry::committedAtMs)
                .containsExactly(50L);
        assertThat(message(r).status()).isEqualTo(BrokerStatus.LEASED);
        assertThat(message(r).currentAttemptId()).isEqualTo("m1-a1");
        assertThat(message(r).acknowledgedAtMs()).isNull();
        assertThat(consumer(r, "c1").status()).isEqualTo(ConsumerStatus.READY);
        assertThat(consumer(r, "c1").currentAttemptId()).isNull();
        assertThat(attempt(r).leaseStatus()).isEqualTo(LeaseStatus.ACTIVE);
        assertThat(attempt(r).effectStatus()).isEqualTo(EffectStatus.COMMITTED);
        assertThat(attempt(r).effectCommittedAtMs()).isEqualTo(50);
        assertThat(attempt(r).ackStatus()).isEqualTo(AckStatus.PENDING);
        assertThat(attempt(r).ackResolvedAtMs()).isNull();
        assertThat(r.result().messageOutcomes().get(0).acknowledgedAtMs()).isEqualTo(55);
        assertThat(r.result().metrics().acknowledgedMessages()).isEqualTo(1);
        assertThat(r.checkpoint().explanation()).contains("50 ms", "55 ms", "ACK remains pending");
    }

    @Test
    void aLostAckPreservesTheFirstRecordAndTheSecondEffectIsNotAnotherFirstEffectSample() {
        var r =
                resolve(
                        "lost-confirmation-repeats-work",
                        "lost-ack",
                        "m1-a2",
                        Kind.EFFECT_COMMITTED,
                        150);
        assertThat(r.observed().ledger())
                .extracting(LedgerEntry::committedAtMs)
                .containsExactly(50L, 150L);
        assertThat(message(r).status()).isEqualTo(BrokerStatus.LEASED);
        assertThat(message(r).currentAttemptId()).isEqualTo("m1-a2");
        assertThat(attempt(r).ackStatus()).isEqualTo(AckStatus.PENDING);
        assertThat(attempt(r).scheduledAckAtMs()).isEqualTo(155);
        var first = r.observed().state().attempts().get(0);
        assertThat(first.ackStatus()).isEqualTo(AckStatus.LOST);
        assertThat(first.ackResolvedAtMs()).isEqualTo(55);
        assertThat(first.leaseStatus()).isEqualTo(LeaseStatus.EXPIRED);
        var metrics = r.result().metrics();
        assertThat(metrics.deliveryAttempts()).isEqualTo(2);
        assertThat(metrics.committedEffects()).isEqualTo(2);
        assertThat(metrics.extraEffects()).isEqualTo(1);
        assertThat(metrics.effectLatencySamples()).isEqualTo(1);
        assertThat(metrics.meanFirstEffectLatencyMs()).isEqualTo(50);
        assertThat(metrics.ackLatencySamples()).isEqualTo(1);
        assertThat(metrics.meanAckLatencyMs()).isEqualTo(155);
        assertThat(r.checkpoint().explanation())
                .contains(
                        "50 ms",
                        "55 ms",
                        "100 ms",
                        "150 ms",
                        "155 ms",
                        "two deliveries, two effects and one extra effect",
                        "over one message");
    }

    @Test
    void crashBeforeCommitCancelsLocalWorkWithoutImmediatelyRequeueingTheLease() {
        var r =
                resolve(
                        "crash-cancels-processing",
                        "crash-before",
                        "m1-a1",
                        Kind.ATTEMPT_CANCELLED,
                        25);
        assertThat(r.observed().ledger()).isEmpty();
        assertThat(consumer(r, "c1").status()).isEqualTo(ConsumerStatus.DOWN);
        assertThat(consumer(r, "c1").currentAttemptId()).isNull();
        assertThat(message(r).status()).isEqualTo(BrokerStatus.LEASED);
        assertThat(message(r).currentAttemptId()).isEqualTo("m1-a1");
        assertThat(attempt(r).leaseStatus()).isEqualTo(LeaseStatus.ACTIVE);
        assertThat(attempt(r).effectStatus()).isEqualTo(EffectStatus.CANCELLED);
        assertThat(attempt(r).ackStatus()).isEqualTo(AckStatus.CANCELLED);
        assertThat(attempt(r).cancelledAtMs()).isEqualTo(25);
        assertThat(attempt(r).effectCommittedAtMs()).isNull();
        assertThat(r.result().attemptOutcomes().get(1).startedAtMs()).isEqualTo(100);
        assertThat(r.result().ledger())
                .extracting(LedgerEntry::committedAtMs)
                .containsExactly(150L);
        assertThat(r.result().messageOutcomes().get(0).acknowledgedAtMs()).isEqualTo(155);
        assertThat(r.result().metrics().deliveryAttempts()).isEqualTo(2);
        assertThat(r.result().metrics().extraEffects()).isZero();
        assertThat(r.checkpoint().explanation())
                .contains(
                        "25 ms",
                        "50 ms",
                        "55 ms",
                        "75 ms",
                        "100 ms",
                        "150 ms",
                        "155 ms",
                        "Two deliveries produce only one effect",
                        "zero extra effects");
    }

    @Test
    void crashAfterCommitCancelsOnlyThePendingAckAndWaitsForRecoveryBeforeRetry() {
        var r =
                resolve(
                        "committed-work-survives",
                        "crash-after",
                        "m1-a1",
                        Kind.ATTEMPT_CANCELLED,
                        52);
        assertThat(r.observed().ledger())
                .extracting(LedgerEntry::committedAtMs)
                .containsExactly(50L);
        assertThat(consumer(r, "c1").status()).isEqualTo(ConsumerStatus.DOWN);
        assertThat(consumer(r, "c1").currentAttemptId()).isNull();
        assertThat(message(r).status()).isEqualTo(BrokerStatus.LEASED);
        assertThat(attempt(r).leaseStatus()).isEqualTo(LeaseStatus.ACTIVE);
        assertThat(attempt(r).effectStatus()).isEqualTo(EffectStatus.COMMITTED);
        assertThat(attempt(r).effectCommittedAtMs()).isEqualTo(50);
        assertThat(attempt(r).ackStatus()).isEqualTo(AckStatus.CANCELLED);
        assertThat(attempt(r).cancelledAtMs()).isEqualTo(52);
        assertThat(r.result().attemptOutcomes().get(1).startedAtMs()).isEqualTo(102);
        assertThat(r.result().ledger())
                .extracting(LedgerEntry::committedAtMs)
                .containsExactly(50L, 152L);
        assertThat(r.result().messageOutcomes().get(0).acknowledgedAtMs()).isEqualTo(157);
        assertThat(r.result().metrics().extraEffects()).isEqualTo(1);
        assertThat(r.checkpoint().explanation())
                .contains(
                        "50 ms",
                        "52 ms",
                        "55 ms",
                        "100 ms",
                        "102 ms",
                        "152 ms",
                        "157 ms",
                        "two effects and one extra effect");
    }

    @Test
    void anEarlyAcceptedAckSurvivesCancellationButDoesNotProveAnEffect() {
        var r =
                resolve(
                        "early-confirmation-loses-work",
                        "early-ack-crash",
                        "m1-a1",
                        Kind.ATTEMPT_CANCELLED,
                        25);
        assertThat(message(r).status()).isEqualTo(BrokerStatus.ACKNOWLEDGED);
        assertThat(message(r).currentAttemptId()).isNull();
        assertThat(message(r).acknowledgedAtMs()).isEqualTo(5);
        assertThat(attempt(r).leaseStatus()).isEqualTo(LeaseStatus.ACKNOWLEDGED);
        assertThat(attempt(r).effectStatus()).isEqualTo(EffectStatus.CANCELLED);
        assertThat(attempt(r).ackStatus()).isEqualTo(AckStatus.ACCEPTED);
        assertThat(attempt(r).ackResolvedAtMs()).isEqualTo(5);
        assertThat(r.observed().ledger()).isEmpty();
        assertThat(r.result().ledger()).isEmpty();
        assertThat(r.result().lastVirtualTimeMs()).isEqualTo(75);
        assertThat(r.result().metrics().deliveryAttempts()).isEqualTo(1);
        assertThat(r.result().metrics().acknowledgedMessages()).isEqualTo(1);
        assertThat(r.result().metrics().acknowledgedWithoutEffect()).isEqualTo(1);
        assertThat(r.checkpoint().explanation())
                .contains("5 ms", "25 ms", "75 ms", "full settlement", "zero effects");
    }

    @Test
    void expiryAndRequeuePrecedeTheStaleAckAndRetryDispatchAtTheSameTime() {
        var r =
                resolve(
                        "deadline-equality-is-stale",
                        "lease-boundary",
                        "m1-a1",
                        Kind.ACK_STALE,
                        100);
        assertThat(message(r).status()).isEqualTo(BrokerStatus.READY);
        assertThat(message(r).currentAttemptId()).isNull();
        assertThat(consumer(r, "c1").currentAttemptId()).isNull();
        assertThat(r.observed().state().attempts()).hasSize(1);
        assertThat(attempt(r).leaseStatus()).isEqualTo(LeaseStatus.EXPIRED);
        assertThat(attempt(r).effectStatus()).isEqualTo(EffectStatus.COMMITTED);
        assertThat(attempt(r).ackStatus()).isEqualTo(AckStatus.STALE);
        assertThat(r.observed().ledger())
                .extracting(LedgerEntry::committedAtMs)
                .containsExactly(95L);
        var atDeadline =
                r.result().events().stream().filter(event -> event.timeMs() == 100).toList();
        assertThat(atDeadline)
                .extracting(DeliveryEvent::kind)
                .containsExactly(
                        Kind.LEASE_EXPIRED,
                        Kind.MESSAGE_REQUEUED,
                        Kind.ACK_SENT,
                        Kind.ACK_STALE,
                        Kind.DELIVERY_STARTED);
        assertThat(r.result().ledger())
                .extracting(LedgerEntry::committedAtMs)
                .containsExactly(95L, 195L);
        assertThat(r.result().lastVirtualTimeMs()).isEqualTo(200);
        assertThat(r.result().metrics().deadLetteredMessages()).isEqualTo(1);
        assertThat(r.result().metrics().ackLatencySamples()).isZero();
        assertThat(r.result().metrics().meanAckLatencyMs()).isNull();
        assertThat(r.result().metrics().p95AckLatencyMs()).isNull();
        var input = r.preset().input();
        var longerLease =
                simulator.run(
                        new DeliveryInput(
                                input.schemaVersion(),
                                input.modelVersion(),
                                input.messages(),
                                input.consumers(),
                                input.processingTimeMs(),
                                input.acknowledgmentDelayMs(),
                                101,
                                input.maxDeliveryAttempts(),
                                input.acknowledgmentPolicy(),
                                input.failures(),
                                input.lostAcknowledgments(),
                                input.seed()));
        assertThat(longerLease.metrics().deliveryAttempts()).isEqualTo(1);
        assertThat(longerLease.metrics().committedEffects()).isEqualTo(1);
        assertThat(longerLease.messageOutcomes().get(0).acknowledgedAtMs()).isEqualTo(100);
        assertThat(longerLease.lastVirtualTimeMs()).isEqualTo(100);
        assertThat(longerLease.events()).noneMatch(event -> event.kind() == Kind.LEASE_EXPIRED);
        assertThat(r.checkpoint().explanation())
                .contains("100 ms", "195 ms", "200 ms", "101 ms", "zero accepted-ACK samples");
    }

    @Test
    void deadLetterStatusDoesNotFenceAStillRunningConsumerFromTheLedger() {
        var r =
                resolve(
                        "dead-letter-does-not-fence",
                        "overlapping-attempts",
                        "m1-a2",
                        Kind.EFFECT_COMMITTED,
                        250);
        var deadLetterTarget =
                new GuidedCheckpoint.Target(null, null, "m1", "m1-a2", "message.dead-lettered", 1);
        var deadLetters =
                r.result().events().stream()
                        .filter(
                                event ->
                                        deadLetterTarget.messageId().equals(event.messageId())
                                                && deadLetterTarget
                                                        .attemptId()
                                                        .equals(event.attemptId())
                                                && deadLetterTarget
                                                        .kind()
                                                        .equals(event.kind().value()))
                        .toList();
        assertThat(deadLetters).hasSize(1);
        assertThat(deadLetters.get(0).timeMs()).isEqualTo(200);
        var beforeSecondEffect = replayThrough(r.result(), deadLetters.get(0).sequence());
        assertThat(beforeSecondEffect.state().messages().get(0).status())
                .isEqualTo(BrokerStatus.DEAD_LETTERED);
        assertThat(beforeSecondEffect.ledger())
                .extracting(LedgerEntry::committedAtMs)
                .containsExactly(150L);
        assertThat(beforeSecondEffect.state().attempts().get(1).effectStatus())
                .isEqualTo(EffectStatus.PROCESSING);
        assertThat(beforeSecondEffect.state().attempts().get(1).leaseStatus())
                .isEqualTo(LeaseStatus.EXPIRED);
        assertThat(beforeSecondEffect.state().consumers().get(1).currentAttemptId())
                .isEqualTo("m1-a2");
        assertThat(message(r).status()).isEqualTo(BrokerStatus.DEAD_LETTERED);
        assertThat(message(r).currentAttemptId()).isNull();
        assertThat(r.observed().ledger())
                .extracting(LedgerEntry::committedAtMs)
                .containsExactly(150L, 250L);
        assertThat(attempt(r).consumerId()).isEqualTo("c2");
        assertThat(attempt(r).leaseStatus()).isEqualTo(LeaseStatus.EXPIRED);
        assertThat(attempt(r).effectStatus()).isEqualTo(EffectStatus.COMMITTED);
        assertThat(attempt(r).ackStatus()).isEqualTo(AckStatus.PENDING);
        assertThat(attempt(r).scheduledAckAtMs()).isEqualTo(255);
        assertThat(consumer(r, "c2").currentAttemptId()).isNull();
        assertThat(
                        r.result().events().stream()
                                .filter(event -> event.kind() == Kind.MESSAGE_DEAD_LETTERED))
                .extracting(DeliveryEvent::timeMs)
                .containsExactly(200L);
        assertThat(r.result().events().stream().filter(event -> event.kind() == Kind.ACK_STALE))
                .extracting(DeliveryEvent::timeMs)
                .containsExactly(155L, 255L);
        assertThat(r.result().metrics().committedEffects()).isEqualTo(2);
        assertThat(r.result().metrics().extraEffects()).isEqualTo(1);
        assertThat(r.result().metrics().ackLatencySamples()).isZero();
        assertThat(r.checkpoint().explanation())
                .contains(
                        "0 ms",
                        "100 ms",
                        "150 and 250 ms",
                        "200 ms",
                        "155 and 255 ms",
                        "two effects, one extra effect and no accepted ACK samples");
    }

    @Test
    void aLimitedStartRetainsProcessingAndPlannedAckWithoutInventingObservedEffects() {
        var r =
                resolve(
                        "censored-effect-is-unobserved",
                        "virtual-limit",
                        "m1-a1",
                        Kind.DELIVERY_STARTED,
                        60_000);
        assertThat(message(r).status()).isEqualTo(BrokerStatus.LEASED);
        assertThat(consumer(r, "c1").currentAttemptId()).isEqualTo("m1-a1");
        assertThat(attempt(r).leaseStatus()).isEqualTo(LeaseStatus.ACTIVE);
        assertThat(attempt(r).effectStatus()).isEqualTo(EffectStatus.PROCESSING);
        assertThat(attempt(r).ackStatus()).isEqualTo(AckStatus.PENDING);
        assertThat(attempt(r).scheduledEffectAtMs()).isEqualTo(60_050);
        assertThat(attempt(r).scheduledAckAtMs()).isEqualTo(60_055);
        assertThat(attempt(r).leaseDeadlineMs()).isEqualTo(60_100);
        assertThat(attempt(r).effectCommittedAtMs()).isNull();
        assertThat(r.observed().ledger()).isEmpty();
        assertThat(r.result().truncationReason()).isEqualTo("virtual_time_limit");
        assertThat(r.result().lastVirtualTimeMs()).isEqualTo(60_000);
        var metrics = r.result().metrics();
        assertThat(metrics.runningEffects()).isEqualTo(1);
        assertThat(metrics.pendingAcknowledgments()).isEqualTo(1);
        assertThat(metrics.effectLatencySamples()).isZero();
        assertThat(metrics.ackLatencySamples()).isZero();
        assertThat(metrics.meanFirstEffectLatencyMs()).isNull();
        assertThat(metrics.p95FirstEffectLatencyMs()).isNull();
        assertThat(metrics.meanAckLatencyMs()).isNull();
        assertThat(metrics.p95AckLatencyMs()).isNull();
        assertThat(metrics.acknowledgedWithoutEffect()).isNull();
        assertThat(r.checkpoint().explanation())
                .contains(
                        "60,050 ms",
                        "60,055 ms",
                        "60,100 ms",
                        "one running effect and one pending ACK",
                        "unknown acknowledged-without-effect count");
    }

    @Test
    void eightAuthoredTargetsCoverTheEightDeclaredPresetsWithoutClaimingEveryPreset() {
        var checkpoints = catalog.draftTopic("queues-delivery").checkpoints();
        assertThat(checkpoints)
                .extracting(GuidedCheckpoint::id)
                .containsExactly(
                        "effect-before-confirmation",
                        "lost-confirmation-repeats-work",
                        "crash-cancels-processing",
                        "committed-work-survives",
                        "early-confirmation-loses-work",
                        "deadline-equality-is-stale",
                        "dead-letter-does-not-fence",
                        "censored-effect-is-unobserved");
        assertThat(checkpoints)
                .extracting(GuidedCheckpoint::presetId)
                .containsExactly(
                        "baseline",
                        "lost-ack",
                        "crash-before",
                        "crash-after",
                        "early-ack-crash",
                        "lease-boundary",
                        "overlapping-attempts",
                        "virtual-limit");
        assertThat(controller.descriptor().presets())
                .extracting(Preset::id)
                .contains("no-recovery");
        assertThat(checkpoints)
                .noneMatch(checkpoint -> checkpoint.presetId().equals("no-recovery"));
    }

    @Test
    void configuredMapperPreservesLegacySelectorsAndOmitsUnusedDeliveryFields() {
        for (var checkpoint : catalog.topic("cache-aside").checkpoints()) {
            var json = mapper.readTree(mapper.writeValueAsBytes(checkpoint.target()));
            assertThat(json.propertyNames())
                    .containsExactlyInAnyOrder("operation", "kind", "occurrence");
            assertThat(
                            mapper.readValue(
                                    mapper.writeValueAsBytes(checkpoint.target()),
                                    GuidedCheckpoint.Target.class))
                    .isEqualTo(checkpoint.target());
        }
        for (var checkpoint : catalog.draftTopic("queues-tail-latency").checkpoints()) {
            var json = mapper.readTree(mapper.writeValueAsBytes(checkpoint.target()));
            assertThat(json.propertyNames())
                    .containsExactlyInAnyOrder("jobId", "kind", "occurrence");
            assertThat(
                            mapper.readValue(
                                    mapper.writeValueAsBytes(checkpoint.target()),
                                    GuidedCheckpoint.Target.class))
                    .isEqualTo(checkpoint.target());
        }
        for (var checkpoint : catalog.draftTopic("queues-delivery").checkpoints()) {
            var json = mapper.readTree(mapper.writeValueAsBytes(checkpoint.target()));
            assertThat(json.propertyNames())
                    .containsExactlyInAnyOrder("messageId", "attemptId", "kind", "occurrence");
            assertThat(
                            mapper.readValue(
                                    mapper.writeValueAsBytes(checkpoint.target()),
                                    GuidedCheckpoint.Target.class))
                    .isEqualTo(checkpoint.target());
        }
    }

    @Test
    void authoredBaselineLostAckAndEarlyAckCrashPathsMatchActualJavaTimelines() {
        var baseline =
                simulator.run(
                        controller.descriptor().presets().stream()
                                .filter(preset -> preset.id().equals("baseline"))
                                .findFirst()
                                .orElseThrow()
                                .input());
        var baselinePath =
                baseline.events().stream()
                        .filter(
                                event ->
                                        event.kind() == Kind.DELIVERY_STARTED
                                                || event.kind() == Kind.EFFECT_COMMITTED
                                                || event.kind() == Kind.ACK_ACCEPTED)
                        .toList();
        assertThat(baselinePath)
                .extracting(DeliveryEvent::kind)
                .containsExactly(Kind.DELIVERY_STARTED, Kind.EFFECT_COMMITTED, Kind.ACK_ACCEPTED);
        assertThat(baselinePath).extracting(DeliveryEvent::timeMs).containsExactly(0L, 50L, 55L);

        var lost =
                simulator.run(
                        controller.descriptor().presets().stream()
                                .filter(preset -> preset.id().equals("lost-ack"))
                                .findFirst()
                                .orElseThrow()
                                .input());
        var lostPath =
                lost.events().stream()
                        .filter(
                                event ->
                                        event.kind() == Kind.DELIVERY_STARTED
                                                || event.kind() == Kind.EFFECT_COMMITTED
                                                || event.kind() == Kind.ACK_LOST
                                                || event.kind() == Kind.ACK_ACCEPTED)
                        .toList();
        assertThat(lostPath)
                .extracting(DeliveryEvent::kind)
                .containsExactly(
                        Kind.DELIVERY_STARTED,
                        Kind.EFFECT_COMMITTED,
                        Kind.ACK_LOST,
                        Kind.DELIVERY_STARTED,
                        Kind.EFFECT_COMMITTED,
                        Kind.ACK_ACCEPTED);
        assertThat(lostPath)
                .extracting(DeliveryEvent::timeMs)
                .containsExactly(0L, 50L, 55L, 100L, 150L, 155L);
        assertThat(lostPath)
                .extracting(DeliveryEvent::attemptId)
                .containsExactly("m1-a1", "m1-a1", "m1-a1", "m1-a2", "m1-a2", "m1-a2");

        var early =
                simulator.run(
                        controller.descriptor().presets().stream()
                                .filter(preset -> preset.id().equals("early-ack-crash"))
                                .findFirst()
                                .orElseThrow()
                                .input());
        var earlyPath =
                early.events().stream()
                        .filter(
                                event ->
                                        event.kind() == Kind.DELIVERY_STARTED
                                                || event.kind() == Kind.ACK_ACCEPTED
                                                || event.kind() == Kind.ATTEMPT_CANCELLED
                                                || event.kind() == Kind.CONSUMER_RECOVERED)
                        .toList();
        assertThat(earlyPath)
                .extracting(DeliveryEvent::kind)
                .containsExactly(
                        Kind.DELIVERY_STARTED,
                        Kind.ACK_ACCEPTED,
                        Kind.ATTEMPT_CANCELLED,
                        Kind.CONSUMER_RECOVERED);
        assertThat(earlyPath).extracting(DeliveryEvent::timeMs).containsExactly(0L, 5L, 25L, 75L);
        assertThat(early.ledger()).isEmpty();
        assertThat(early.metrics().acknowledgedWithoutEffect()).isEqualTo(1);
    }
}
