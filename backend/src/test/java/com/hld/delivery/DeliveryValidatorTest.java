package com.hld.delivery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.hld.delivery.DeliveryInput.AcknowledgmentPolicy;
import com.hld.delivery.DeliveryInput.Consumer;
import com.hld.delivery.DeliveryInput.Failure;
import com.hld.delivery.DeliveryInput.FailureAction;
import com.hld.delivery.DeliveryInput.LostAcknowledgment;
import com.hld.delivery.DeliveryInput.Message;
import com.hld.delivery.DeliveryState.AckStatus;
import com.hld.delivery.DeliveryState.Attempt;
import com.hld.delivery.DeliveryState.EffectStatus;
import com.hld.delivery.DeliveryState.LeaseStatus;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.stream.IntStream;
import java.util.stream.Stream;

class DeliveryValidatorTest {
    private static DeliveryInput baseline() {
        return new DeliveryInput(
                "1.0",
                "1.0.0",
                List.of(new Message("m1", 0)),
                List.of(new Consumer("c1")),
                50,
                5,
                100,
                3,
                AcknowledgmentPolicy.ACK_AFTER_EFFECT,
                List.of(),
                List.of(),
                7);
    }

    private static DeliveryInput lists(
            List<Message> messages,
            List<Consumer> consumers,
            List<Failure> failures,
            List<LostAcknowledgment> losses) {
        return new DeliveryInput(
                "1.0",
                "1.0.0",
                messages,
                consumers,
                50,
                5,
                100,
                3,
                AcknowledgmentPolicy.ACK_AFTER_EFFECT,
                failures,
                losses,
                7);
    }

    private static DeliveryInput numbers(String field, long value) {
        var b = baseline();
        return new DeliveryInput(
                b.schemaVersion(),
                b.modelVersion(),
                b.messages(),
                b.consumers(),
                field.equals("processing") ? value : b.processingTimeMs(),
                field.equals("ack") ? value : b.acknowledgmentDelayMs(),
                field.equals("lease") ? value : b.visibilityTimeoutMs(),
                field.equals("attempts") ? (int) value : b.maxDeliveryAttempts(),
                b.acknowledgmentPolicy(),
                b.failures(),
                b.lostAcknowledgments(),
                field.equals("seed") ? value : b.seed());
    }

    @Test
    void acceptsTheBaselineAndEveryInclusiveNumericBoundary() {
        DeliveryValidator.validate(baseline());
        for (var entry :
                List.of(
                        new Object[] {"processing", 1L},
                        new Object[] {"processing", 1_000L},
                        new Object[] {"ack", 1L},
                        new Object[] {"ack", 1_000L},
                        new Object[] {"lease", 1L},
                        new Object[] {"lease", 60_000L},
                        new Object[] {"attempts", 1L},
                        new Object[] {"attempts", 5L},
                        new Object[] {"seed", -DeliveryInput.MAX_ABSOLUTE_SEED},
                        new Object[] {"seed", DeliveryInput.MAX_ABSOLUTE_SEED})) {
            DeliveryValidator.validate(numbers((String) entry[0], (long) entry[1]));
        }
        DeliveryValidator.validate(
                lists(
                        List.of(new Message("m1", 60_000)),
                        baseline().consumers(),
                        List.of(
                                new Failure("c1", FailureAction.CRASH, 0),
                                new Failure("c1", FailureAction.RECOVER, 60_000)),
                        List.of()));
    }

    static Stream<Arguments> invalidNumbers() {
        return Stream.of(
                Arguments.of("processing", 0L),
                Arguments.of("processing", 1_001L),
                Arguments.of("processing", Long.MAX_VALUE),
                Arguments.of("processing", Long.MIN_VALUE),
                Arguments.of("ack", 0L),
                Arguments.of("ack", 1_001L),
                Arguments.of("lease", 0L),
                Arguments.of("lease", 60_001L),
                Arguments.of("attempts", 0L),
                Arguments.of("attempts", 6L),
                Arguments.of("seed", -DeliveryInput.MAX_ABSOLUTE_SEED - 1),
                Arguments.of("seed", DeliveryInput.MAX_ABSOLUTE_SEED + 1));
    }

    @ParameterizedTest
    @MethodSource("invalidNumbers")
    void rejectsOutOfRangeValuesBeforeTheyCanReachTimeArithmetic(String field, long value) {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> DeliveryValidator.validate(numbers(field, value)));
    }

    @Test
    void rejectsNullInputUnsupportedVersionsAndNullPolicy() {
        assertThatIllegalArgumentException().isThrownBy(() -> DeliveryValidator.validate(null));
        var b = baseline();
        for (String schema : new String[] {null, "", "1.1", "1.0.0"}) {
            assertThatIllegalArgumentException()
                    .isThrownBy(
                            () ->
                                    DeliveryValidator.validate(
                                            new DeliveryInput(
                                                    schema,
                                                    b.modelVersion(),
                                                    b.messages(),
                                                    b.consumers(),
                                                    50,
                                                    5,
                                                    100,
                                                    3,
                                                    b.acknowledgmentPolicy(),
                                                    List.of(),
                                                    List.of(),
                                                    7)));
        }
        for (String model : new String[] {null, "", "1.0", "1.0.1"}) {
            assertThatIllegalArgumentException()
                    .isThrownBy(
                            () ->
                                    DeliveryValidator.validate(
                                            new DeliveryInput(
                                                    b.schemaVersion(),
                                                    model,
                                                    b.messages(),
                                                    b.consumers(),
                                                    50,
                                                    5,
                                                    100,
                                                    3,
                                                    b.acknowledgmentPolicy(),
                                                    List.of(),
                                                    List.of(),
                                                    7)));
        }
        assertThatIllegalArgumentException()
                .isThrownBy(
                        () ->
                                DeliveryValidator.validate(
                                        new DeliveryInput(
                                                "1.0",
                                                "1.0.0",
                                                b.messages(),
                                                b.consumers(),
                                                50,
                                                5,
                                                100,
                                                3,
                                                null,
                                                List.of(),
                                                List.of(),
                                                7)));
    }

    @Test
    void beforeEffectPolicyRequiresStrictlyEarlierAcknowledgment() {
        var b = baseline();
        for (long delay : new long[] {50, 51}) {
            assertThatIllegalArgumentException()
                    .isThrownBy(
                            () ->
                                    DeliveryValidator.validate(
                                            new DeliveryInput(
                                                    "1.0",
                                                    "1.0.0",
                                                    b.messages(),
                                                    b.consumers(),
                                                    50,
                                                    delay,
                                                    100,
                                                    3,
                                                    AcknowledgmentPolicy.ACK_BEFORE_EFFECT,
                                                    List.of(),
                                                    List.of(),
                                                    7)));
        }
        assertThatNoException()
                .isThrownBy(
                        () ->
                                DeliveryValidator.validate(
                                        new DeliveryInput(
                                                "1.0",
                                                "1.0.0",
                                                b.messages(),
                                                b.consumers(),
                                                50,
                                                49,
                                                1,
                                                3,
                                                AcknowledgmentPolicy.ACK_BEFORE_EFFECT,
                                                List.of(),
                                                List.of(),
                                                7)));
    }

    @Test
    void rejectsMissingEmptyOrOversizedRequiredCollections() {
        var b = baseline();
        for (List<Message> messages :
                Arrays.asList(
                        null,
                        List.<Message>of(),
                        IntStream.range(0, 21).mapToObj(i -> new Message("m" + i, 0)).toList())) {
            assertThatIllegalArgumentException()
                    .isThrownBy(
                            () ->
                                    DeliveryValidator.validate(
                                            lists(messages, b.consumers(), List.of(), List.of())));
        }
        for (List<Consumer> consumers :
                Arrays.asList(
                        null,
                        List.<Consumer>of(),
                        IntStream.range(0, 4).mapToObj(i -> new Consumer("c" + i)).toList())) {
            assertThatIllegalArgumentException()
                    .isThrownBy(
                            () ->
                                    DeliveryValidator.validate(
                                            lists(b.messages(), consumers, List.of(), List.of())));
        }
        assertThatIllegalArgumentException()
                .isThrownBy(
                        () ->
                                DeliveryValidator.validate(
                                        lists(b.messages(), b.consumers(), null, List.of())));
        assertThatIllegalArgumentException()
                .isThrownBy(
                        () ->
                                DeliveryValidator.validate(
                                        lists(b.messages(), b.consumers(), List.of(), null)));
        var tooManyLosses =
                IntStream.range(0, 21).mapToObj(i -> new LostAcknowledgment("m1", 1)).toList();
        assertThatIllegalArgumentException()
                .isThrownBy(
                        () ->
                                DeliveryValidator.validate(
                                        lists(
                                                b.messages(),
                                                b.consumers(),
                                                List.of(),
                                                tooManyLosses)));
    }

    @Test
    void acceptsMaximumCollectionsAndBoundsFailuresAcrossAllConsumers() {
        var messages = IntStream.range(0, 20).mapToObj(i -> new Message("m" + i, 0)).toList();
        var consumers = List.of(new Consumer("c1"), new Consumer("c2"), new Consumer("c3"));
        var failures =
                IntStream.range(0, 8)
                        .mapToObj(
                                i ->
                                        new Failure(
                                                i < 4 ? "c1" : "c2",
                                                i % 2 == 0
                                                        ? FailureAction.CRASH
                                                        : FailureAction.RECOVER,
                                                i))
                        .toList();
        var losses =
                messages.stream().map(message -> new LostAcknowledgment(message.id(), 1)).toList();
        DeliveryValidator.validate(lists(messages, consumers, failures, losses));
        var ninthFailure = new ArrayList<>(failures);
        ninthFailure.add(new Failure("c3", FailureAction.CRASH, 10));
        assertThatIllegalArgumentException()
                .isThrownBy(
                        () ->
                                DeliveryValidator.validate(
                                        lists(messages, consumers, ninthFailure, losses)))
                .withMessageContaining("0–8");
    }

    @Test
    void acceptsUnsortedInputsWithoutReorderingAndChecksFailuresChronologically() {
        var messages = List.of(new Message("later", 50), new Message("first", 0));
        var failures =
                List.of(
                        new Failure("c1", FailureAction.RECOVER, 75),
                        new Failure("c1", FailureAction.CRASH, 25));
        var input = lists(messages, baseline().consumers(), failures, List.of());
        DeliveryValidator.validate(input);
        assertThat(input.messages()).containsExactlyElementsOf(messages);
        assertThat(input.failures()).containsExactlyElementsOf(failures);
        assertThatIllegalArgumentException()
                .isThrownBy(
                        () ->
                                DeliveryValidator.validate(
                                        lists(
                                                messages,
                                                baseline().consumers(),
                                                List.of(
                                                        new Failure("c1", FailureAction.CRASH, 75),
                                                        new Failure(
                                                                "c1", FailureAction.RECOVER, 25)),
                                                List.of())));
    }

    @Test
    void rejectsUnknownDuplicateOrImpossibleFailureActions() {
        var b = baseline();
        for (List<Failure> failures :
                List.of(
                        List.of(new Failure("unknown", FailureAction.CRASH, 0)),
                        List.of(new Failure("c1", null, 0)),
                        List.of(new Failure("c1", FailureAction.CRASH, -1)),
                        List.of(new Failure("c1", FailureAction.CRASH, 60_001)),
                        List.of(new Failure("c1", FailureAction.RECOVER, 0)),
                        List.of(
                                new Failure("c1", FailureAction.CRASH, 0),
                                new Failure("c1", FailureAction.CRASH, 1)),
                        List.of(
                                new Failure("c1", FailureAction.CRASH, 0),
                                new Failure("c1", FailureAction.RECOVER, 0)))) {
            assertThatIllegalArgumentException()
                    .isThrownBy(
                            () ->
                                    DeliveryValidator.validate(
                                            lists(
                                                    b.messages(),
                                                    b.consumers(),
                                                    failures,
                                                    List.of())));
        }
        DeliveryValidator.validate(
                lists(
                        b.messages(),
                        List.of(new Consumer("c1"), new Consumer("c2")),
                        List.of(
                                new Failure("c1", FailureAction.CRASH, 0),
                                new Failure("c2", FailureAction.CRASH, 0)),
                        List.of()));
    }

    @Test
    void rejectsUnknownDuplicateAndOutOfBudgetLostAcknowledgmentSelectors() {
        var b = baseline();
        for (List<LostAcknowledgment> losses :
                List.of(
                        List.of(new LostAcknowledgment("unknown", 1)),
                        List.of(new LostAcknowledgment("m1", 0)),
                        List.of(new LostAcknowledgment("m1", 4)),
                        List.of(
                                new LostAcknowledgment("m1", 1),
                                new LostAcknowledgment("m1", 1)))) {
            assertThatIllegalArgumentException()
                    .isThrownBy(
                            () ->
                                    DeliveryValidator.validate(
                                            lists(b.messages(), b.consumers(), List.of(), losses)));
        }
        DeliveryValidator.validate(
                lists(
                        b.messages(),
                        b.consumers(),
                        List.of(),
                        List.of(new LostAcknowledgment("m1", 1), new LostAcknowledgment("m1", 3))));
    }

    @Test
    void validatesAllIdentitiesAndTimestampsAndAllowsSeparateIdentityNamespaces() {
        var b = baseline();
        for (String id : new String[] {null, "", "M1", "m!1", "1m", "x".repeat(33), "m1\n"}) {
            assertThatIllegalArgumentException()
                    .isThrownBy(
                            () ->
                                    DeliveryValidator.validate(
                                            lists(
                                                    List.of(new Message(id, 0)),
                                                    b.consumers(),
                                                    List.of(),
                                                    List.of())));
            assertThatIllegalArgumentException()
                    .isThrownBy(
                            () ->
                                    DeliveryValidator.validate(
                                            lists(
                                                    b.messages(),
                                                    List.of(new Consumer(id)),
                                                    List.of(),
                                                    List.of())));
            assertThatIllegalArgumentException()
                    .isThrownBy(
                            () ->
                                    DeliveryValidator.validate(
                                            lists(
                                                    b.messages(),
                                                    b.consumers(),
                                                    List.of(
                                                            new Failure(
                                                                    id, FailureAction.CRASH, 0)),
                                                    List.of())));
            assertThatIllegalArgumentException()
                    .isThrownBy(
                            () ->
                                    DeliveryValidator.validate(
                                            lists(
                                                    b.messages(),
                                                    b.consumers(),
                                                    List.of(),
                                                    List.of(new LostAcknowledgment(id, 1)))));
        }
        for (long time : new long[] {-1, 60_001, Long.MAX_VALUE}) {
            assertThatIllegalArgumentException()
                    .isThrownBy(
                            () ->
                                    DeliveryValidator.validate(
                                            lists(
                                                    List.of(new Message("m1", time)),
                                                    b.consumers(),
                                                    List.of(),
                                                    List.of())));
        }
        assertThatIllegalArgumentException()
                .isThrownBy(
                        () ->
                                DeliveryValidator.validate(
                                        lists(
                                                List.of(new Message("m1", 0), new Message("m1", 1)),
                                                b.consumers(),
                                                List.of(),
                                                List.of())));
        assertThatIllegalArgumentException()
                .isThrownBy(
                        () ->
                                DeliveryValidator.validate(
                                        lists(
                                                b.messages(),
                                                List.of(new Consumer("c1"), new Consumer("c1")),
                                                List.of(),
                                                List.of())));
        String longest = "m" + "x".repeat(31);
        DeliveryValidator.validate(
                lists(
                        List.of(new Message(longest, 0)),
                        List.of(new Consumer(longest)),
                        List.of(),
                        List.of(new LostAcknowledgment(longest, 3))));
    }

    @Test
    void retainsInvalidNullElementsForConsistentDirectValidation() {
        var b = baseline();
        var inputs =
                List.of(
                        lists(Arrays.asList((Message) null), b.consumers(), List.of(), List.of()),
                        lists(b.messages(), Arrays.asList((Consumer) null), List.of(), List.of()),
                        lists(
                                b.messages(),
                                b.consumers(),
                                Arrays.asList((Failure) null),
                                List.of()),
                        lists(
                                b.messages(),
                                b.consumers(),
                                List.of(),
                                Arrays.asList((LostAcknowledgment) null)));
        for (var input : inputs) {
            assertThatIllegalArgumentException()
                    .isThrownBy(() -> DeliveryValidator.validate(input));
        }
    }

    @Test
    void inputCollectionsAreOwnedAndUnmodifiable() {
        var messages = new ArrayList<>(baseline().messages());
        var consumers = new ArrayList<>(baseline().consumers());
        var failures = new ArrayList<Failure>();
        var losses = new ArrayList<LostAcknowledgment>();
        var input = lists(messages, consumers, failures, losses);
        messages.clear();
        consumers.clear();
        failures.add(new Failure("c1", FailureAction.CRASH, 0));
        losses.add(new LostAcknowledgment("m1", 1));
        DeliveryValidator.validate(input);
        assertThat(input.messages()).hasSize(1);
        assertThat(input.consumers()).hasSize(1);
        assertThat(input.failures()).isEmpty();
        assertThat(input.lostAcknowledgments()).isEmpty();
        assertThatThrownBy(() -> input.messages().clear())
                .isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> input.consumers().clear())
                .isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> input.failures().add(new Failure("c1", FailureAction.CRASH, 0)))
                .isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> input.lostAcknowledgments().add(new LostAcknowledgment("m1", 1)))
                .isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void attemptHelpersKeepCommittedEffectsAndAcceptedEarlyAcknowledgmentsIndependent() {
        var processing =
                new Attempt(
                        "m1-a1",
                        "m1",
                        1,
                        "c1",
                        "m1-a1-lease",
                        100,
                        0,
                        50,
                        55,
                        LeaseStatus.ACTIVE,
                        EffectStatus.PROCESSING,
                        AckStatus.PENDING,
                        null,
                        null,
                        null,
                        null);
        var committed = processing.withEffect(EffectStatus.COMMITTED, 50L, null);
        var cancelledAck =
                committed
                        .withAck(AckStatus.CANCELLED, null, null, 52L)
                        .withLease(LeaseStatus.EXPIRED);
        assertThat(cancelledAck.effectStatus()).isEqualTo(EffectStatus.COMMITTED);
        assertThat(cancelledAck.effectCommittedAtMs()).isEqualTo(50);
        assertThat(cancelledAck.ackStatus()).isEqualTo(AckStatus.CANCELLED);
        assertThat(cancelledAck.cancelledAtMs()).isEqualTo(52);
        assertThat(cancelledAck.leaseStatus()).isEqualTo(LeaseStatus.EXPIRED);
        assertThat(cancelledAck.scheduledAckAtMs()).isEqualTo(55);
        assertThat(processing.effectStatus()).isEqualTo(EffectStatus.PROCESSING);
        assertThat(processing.ackStatus()).isEqualTo(AckStatus.PENDING);
        var earlyAck =
                processing
                        .withAck(AckStatus.ACCEPTED, 5L, 5L, null)
                        .withLease(LeaseStatus.ACKNOWLEDGED)
                        .withEffect(EffectStatus.COMMITTED, 50L, null);
        assertThat(earlyAck.ackStatus()).isEqualTo(AckStatus.ACCEPTED);
        assertThat(earlyAck.ackSentAtMs()).isEqualTo(5);
        assertThat(earlyAck.ackResolvedAtMs()).isEqualTo(5);
        assertThat(earlyAck.effectCommittedAtMs()).isEqualTo(50);
        assertThat(earlyAck.leaseStatus()).isEqualTo(LeaseStatus.ACKNOWLEDGED);
    }

    @Test
    void stateChangesAndResultsOwnEveryOutputCollection() {
        var messages = new ArrayList<DeliveryState.Message>();
        messages.add(
                new DeliveryState.Message(
                        "m1", DeliveryState.BrokerStatus.NOT_ENQUEUED, 0, null, 0, null, null));
        var consumers = new ArrayList<DeliveryState.Consumer>();
        consumers.add(new DeliveryState.Consumer("c1", DeliveryState.ConsumerStatus.READY, null));
        var attempts = new ArrayList<Attempt>();
        var state = new DeliveryState(messages, consumers, attempts);
        var changes = new DeliveryEvent.Changes(messages, consumers, attempts);
        messages.clear();
        consumers.clear();
        assertThat(state.messages()).hasSize(1);
        assertThat(state.consumers()).hasSize(1);
        assertThat(changes.messages()).hasSize(1);
        assertThat(changes.consumers()).hasSize(1);
        assertThatThrownBy(() -> state.messages().clear())
                .isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> state.consumers().clear())
                .isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> state.attempts().clear())
                .isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> changes.messages().clear())
                .isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> changes.consumers().clear())
                .isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> changes.attempts().clear())
                .isInstanceOf(UnsupportedOperationException.class);

        var assumptions = new ArrayList<>(List.of("Illustrative model"));
        var events = new ArrayList<DeliveryEvent>();
        var outcomes = new ArrayList<DeliveryResult.MessageOutcome>();
        var ledger = new ArrayList<LedgerEntry>();
        var failures = new ArrayList<DeliveryResult.FailureOutcome>();
        var losses = new ArrayList<DeliveryResult.LostAcknowledgmentOutcome>();
        var result =
                new DeliveryResult(
                        "1.0",
                        "queues-delivery",
                        "1.0.0",
                        7,
                        "limited",
                        "event_limit",
                        0,
                        assumptions,
                        state,
                        events,
                        state,
                        outcomes,
                        attempts,
                        ledger,
                        null,
                        failures,
                        losses);
        assumptions.clear();
        events.add(
                new DeliveryEvent(
                        1,
                        0,
                        DeliveryEvent.Kind.MESSAGE_ENQUEUED,
                        "m1",
                        null,
                        null,
                        "Enqueued",
                        changes,
                        null));
        outcomes.add(
                new DeliveryResult.MessageOutcome(
                        "m1",
                        DeliveryState.BrokerStatus.NOT_ENQUEUED,
                        0,
                        0,
                        null,
                        null,
                        null,
                        null));
        ledger.add(new LedgerEntry("m1-a1-effect", "m1", "m1-a1", "c1", 50));
        failures.add(
                new DeliveryResult.FailureOutcome(
                        0,
                        "c1",
                        FailureAction.CRASH,
                        25,
                        DeliveryResult.FailureOutcomeStatus.UNOBSERVED));
        losses.add(
                new DeliveryResult.LostAcknowledgmentOutcome(
                        "m1", 1, DeliveryResult.LossOutcomeStatus.UNOBSERVED));
        assertThat(result.assumptions()).containsExactly("Illustrative model");
        assertThat(result.events()).isEmpty();
        assertThat(result.messageOutcomes()).isEmpty();
        assertThat(result.ledger()).isEmpty();
        assertThat(result.failureOutcomes()).isEmpty();
        assertThat(result.lostAcknowledgmentOutcomes()).isEmpty();
        for (List<?> list :
                List.of(
                        result.assumptions(),
                        result.events(),
                        result.messageOutcomes(),
                        result.attemptOutcomes(),
                        result.ledger(),
                        result.failureOutcomes(),
                        result.lostAcknowledgmentOutcomes())) {
            assertThatThrownBy(list::clear).isInstanceOf(UnsupportedOperationException.class);
        }
    }
}
