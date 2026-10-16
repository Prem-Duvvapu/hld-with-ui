package com.hld.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.hld.catalog.CatalogService;
import com.hld.catalog.GuidedCheckpoint;
import com.hld.retries.RetryPresets;
import com.hld.retries.RetryResult;
import com.hld.retries.RetryResult.*;
import com.hld.retries.RetrySimulator;
import java.util.List;
import java.util.Objects;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/** Authored semantic targets resolve actual Java events and complete selected-prefix states. */
@SpringBootTest
class RetryGuidedCheckpointsTest {
    @Autowired CatalogService catalog;
    @Autowired RetryController controller;
    @Autowired RetrySimulator simulator;

    record Expected(String id, String preset, String request, String attempt, Kind kind,
            int sequence, int time, Integer delay, Integer retryAt, Integer proposal,
            State state, Metrics metrics) {}

    private static RequestState request(String id, int deadline, Phase phase, int sent,
            Integer next, Integer finished, FailureReason failure, FailureCause last) {
        return new RequestState(id, deadline, phase, sent, null, next, finished, failure, last);
    }
    private static AttemptState rejected(String request, int number, int sent, FailureCause cause) {
        return new AttemptState(request + "-a" + number, request, number, sent,
                CallerState.REJECTED, WorkState.NOT_ACCEPTED, null, null, sent, null, cause);
    }
    private static State state(List<RequestState> requests, List<AttemptState> attempts, String running, int budget) {
        return new State(requests, attempts, List.of(new WorkerState("worker-1", running)), List.of(), budget);
    }
    static Stream<Expected> checkpoints() {
        var unavailable = FailureCause.DEPENDENCY_UNAVAILABLE;
        var timeout = new AttemptState("a-a1", "a", 1, 0, CallerState.TIMED_OUT, WorkState.RUNNING,
                0, null, 50, 50, FailureCause.ATTEMPT_TIMEOUT);
        var twoRejected = List.of(rejected("a", 1, 0, unavailable), rejected("a", 2, 40, unavailable));
        return Stream.of(
                new Expected("retry-timeout-keeps-work", "late-work", "a", "a-a1", Kind.ATTEMPT_TIMED_OUT, 4, 50, null, null, null,
                        state(List.of(request("a", 500, Phase.DECIDING_RETRY, 1, null, null, null, FailureCause.ATTEMPT_TIMEOUT)),
                                List.of(timeout), "a-a1", 48),
                        new Metrics(1, 0, 1, 2, 1, 0, 2, 2, 2, 2, 1, 1, 1, 160, 2, 2)),
                new Expected("retry-current-response-succeeds", "healthy-timeout", "a", null, Kind.REQUEST_SUCCEEDED, 5, 80, null, null, null,
                        state(List.of(request("a", 500, Phase.SUCCEEDED, 1, null, 80, null, null)),
                                List.of(new AttemptState("a-a1", "a", 1, 0, CallerState.RESPONDED, WorkState.COMPLETED,
                                        0, 80, 80, 100, null)), null, 48),
                        new Metrics(1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 80, 1, 1)),
                new Expected("retry-rejected-is-not-accepted", "queue-full", "a", "a-a2", Kind.ATTEMPT_REJECTED, 7, 50, null, null, null,
                        state(List.of(request("a", 500, Phase.DECIDING_RETRY, 2, null, null, null, FailureCause.QUEUE_FULL)),
                                List.of(timeout, rejected("a", 2, 50, FailureCause.QUEUE_FULL)), "a-a1", 47),
                        new Metrics(1, 0, 1, 2, 1, 1, 1, 1, 1, 1, 1, 0, 1, 80, 2, 1)),
                new Expected("retry-immediate-spends-attempts", "immediate-outage", "a", null, Kind.REQUEST_FAILED, 10, 0, null, null, null,
                        state(List.of(request("a", 200, Phase.FAILED, 3, null, 0, FailureReason.ATTEMPTS_EXHAUSTED, unavailable)),
                                List.of(rejected("a", 1, 0, unavailable), rejected("a", 2, 0, unavailable), rejected("a", 3, 0, unavailable)), null, 46),
                        new Metrics(1, 0, 1, 3, 2, 3, 0, 0, 0, 0, 2, 0, 0, 0, 3, 0)),
                new Expected("retry-delay-is-relative", "backoff-recovery", "a", "a-a2", Kind.RETRY_SCHEDULED, 7, 40, 80, 120, null,
                        state(List.of(request("a", 200, Phase.BACKING_OFF, 2, 120, null, null, unavailable)), twoRejected, null, 47),
                        new Metrics(1, 1, 0, 3, 2, 2, 1, 1, 0, 0, 2, 0, 1, 140, 3, 1)),
                new Expected("retry-proposal-is-not-scheduled", "deadline-before-retry", "a", "a-a2", Kind.RETRY_BLOCKED_BY_DEADLINE, 7, 40, 80, null, 120,
                        state(List.of(request("a", 100, Phase.AWAITING_DEADLINE, 2, null, null, null, unavailable)), twoRejected, null, 47),
                        new Metrics(1, 0, 1, 2, 1, 2, 0, 0, 0, 0, 1, 0, 0, 100, 2, 0)),
                new Expected("retry-budget-is-checked-at-dispatch", "retry-budget", "b", null, Kind.REQUEST_FAILED, 12, 40, null, null, null,
                        state(List.of(request("a", 200, Phase.FAILED, 2, null, 40, FailureReason.RETRY_BUDGET_EXHAUSTED, unavailable),
                                        request("b", 200, Phase.FAILED, 1, null, 40, FailureReason.RETRY_BUDGET_EXHAUSTED, unavailable)),
                                List.of(rejected("a", 1, 0, unavailable), rejected("b", 1, 0, unavailable), rejected("a", 2, 40, unavailable)), null, 0),
                        new Metrics(2, 0, 2, 3, 1, 3, 0, 0, 0, 0, 1, 0, 0, 40, 1.5, 0)),
                new Expected("retry-seeded-delay-is-evidence", "jittered-recovery", "a", "a-a1", Kind.RETRY_SCHEDULED, 4, 0, 7, 7, null,
                        state(List.of(request("a", 300, Phase.BACKING_OFF, 1, 7, null, null, unavailable),
                                        request("b", 300, Phase.NOT_ARRIVED, 0, null, null, null, null)),
                                List.of(rejected("a", 1, 0, unavailable)), null, 8),
                        new Metrics(2, 2, 0, 8, 6, 6, 2, 2, 0, 0, 6, 1, 1, 139, 4, 1)));
    }

    @ParameterizedTest @MethodSource("checkpoints")
    void everyCanonicalCheckpointResolvesItsExactIdentityKindOccurrenceAndFullJavaEvidence(Expected expected) {
        var checkpoint = catalog.draftTopic("timeouts-retries").checkpoints().stream()
                .filter(c -> c.id().equals(expected.id())).findFirst().orElseThrow();
        assertThat(checkpoint.simulationId()).isEqualTo(RetrySimulator.SIMULATION_ID);
        assertThat(checkpoint.presetId()).isEqualTo(expected.preset());
        var target = checkpoint.target();
        assertThat(target.requestId()).isEqualTo(expected.request());
        assertThat(target.attemptId()).isEqualTo(expected.attempt());
        assertThat(target.kind()).isEqualTo(expected.kind().name());
        assertThat(target.occurrence()).isEqualTo(1);
        assertThat(target.operation()).isNull(); assertThat(target.jobId()).isNull();
        assertThat(target.messageId()).isNull(); assertThat(target.operationId()).isNull(); assertThat(target.stepId()).isNull();
        var preset = controller.descriptor().presets().stream().filter(p -> p.id().equals(checkpoint.presetId())).findFirst().orElseThrow();
        var result = simulator.run(preset.input());
        var matches = matches(result, target);
        assertThat(matches).as(expected.id() + " exact semantic event").hasSize(1);
        var event = matches.get(target.occurrence() - 1);
        assertThat(event.sequence()).isEqualTo(expected.sequence());
        assertThat(event.timeMs()).isEqualTo(expected.time());
        assertThat(event.delayMs()).isEqualTo(expected.delay());
        assertThat(event.retryAtMs()).isEqualTo(expected.retryAt());
        assertThat(event.proposedRetryAtMs()).isEqualTo(expected.proposal());
        assertThat(event.postState()).isEqualTo(expected.state());
        assertThat(result.metrics()).isEqualTo(expected.metrics());
        assertThat(result.finalState()).isEqualTo(result.events().get(result.events().size() - 1).postState());
        assertThat(result.input()).isEqualTo(preset.input());
        assertThat(result.modelVersion()).isEqualTo("1.0.0");
        assertThat(result.schemaVersion()).isEqualTo("1.0");
        assertThat(result.kind()).isEqualTo("simulation");
        assertThat(result.status()).isEqualTo("completed");
    }

    @Test void eightAuthoredActivitiesCoverExactlyAllCanonicalPresetsAndKeepAnswerIdentitiesDistinct() {
        var detail = catalog.draftTopic("timeouts-retries");
        var checkpoints = detail.checkpoints();
        assertThat(checkpoints).extracting(GuidedCheckpoint::id).containsExactly(
                "retry-timeout-keeps-work", "retry-current-response-succeeds", "retry-rejected-is-not-accepted",
                "retry-immediate-spends-attempts", "retry-delay-is-relative", "retry-proposal-is-not-scheduled",
                "retry-budget-is-checked-at-dispatch", "retry-seeded-delay-is-evidence");
        assertThat(checkpoints.stream().map(GuidedCheckpoint::presetId)).containsExactlyElementsOf(
                RetryPresets.all().stream().map(RetryPresets.Preset::id).toList());
        assertThat(detail.topic().contentVersion()).isEqualTo("1.1.0");
        assertThat(detail.topic().capabilities()).contains("guided");
        assertThat(checkpoints).allSatisfy(checkpoint -> {
            assertThat(checkpoint.simulationId()).isEqualTo("timeouts-retries");
            assertThat(checkpoint.id()).hasSizeLessThanOrEqualTo(100 - "-prediction".length());
            assertThat(detail.questions()).noneMatch(question -> question.id().equals(checkpoint.id() + "-prediction")
                    || question.id().equals(checkpoint.id() + "-tradeoff"));
            assertThat(checkpoint.tradeoff().options()).extracting(GuidedCheckpoint.Tradeoff.Option::id)
                    .doesNotHaveDuplicates().contains(checkpoint.tradeoff().recommendedOptionId());
        });
    }

    @Test void selectedTimeoutRejectionAndBlockedProposalNeverBorrowTheirLaterTerminalEvidence() {
        var late = run("late-work");
        var selectedTimeout = late.events().get(3).postState();
        assertThat(selectedTimeout.attempts()).hasSize(1);
        assertThat(selectedTimeout.attempts().get(0).completedAtMs()).isNull();
        assertThat(selectedTimeout.requests().get(0).finishedAtMs()).isNull();
        assertThat(late.metrics().completedServerWork()).isEqualTo(2);
        var queue = run("queue-full");
        assertThat(queue.events().get(6).postState().requests().get(0).phase()).isEqualTo(Phase.DECIDING_RETRY);
        assertThat(queue.events().get(7).postState().requests().get(0).failureReason()).isEqualTo(FailureReason.ATTEMPTS_EXHAUSTED);
        var blocked = run("deadline-before-retry");
        assertThat(blocked.events().get(6).postState().requests().get(0).finishedAtMs()).isNull();
        assertThat(blocked.finalState().requests().get(0).finishedAtMs()).isEqualTo(100);
        assertThat(blocked.finalState().attempts()).hasSize(2);
    }

    @Test void kindRequestAttemptAndOccurrenceAreAllNecessaryToResolveATarget() {
        var result = run("late-work");
        for (var target : List.of(
                target("b", "b-a1", "ATTEMPT_TIMED_OUT", 1),
                target("a", "a-a2", "WORK_STARTED", 2),
                target("a", "a-a1", "ATTEMPT_REJECTED", 1),
                target("a", null, "REQUEST_SUCCEEDED", 1)))
            assertThat(matches(result, target).size()).isLessThan(target.occurrence());
        assertThat(matches(result, target("a", "a-a1", "WORK_COMPLETED", 1))).hasSize(1);
        assertThat(matches(result, target("a", "a-a2", "WORK_COMPLETED", 1))).hasSize(1);
    }

    private RetryResult run(String preset) {
        return simulator.run(RetryPresets.all().stream().filter(p -> p.id().equals(preset)).findFirst().orElseThrow().input());
    }
    private static GuidedCheckpoint.Target target(String request, String attempt, String kind, int occurrence) {
        return new GuidedCheckpoint.Target(null, null, null, attempt, null, null, request, kind, occurrence);
    }
    private static List<Event> matches(RetryResult result, GuidedCheckpoint.Target target) {
        return result.events().stream().filter(event -> event.requestId().equals(target.requestId())
                && Objects.equals(event.attemptId(), target.attemptId()) && event.kind().name().equals(target.kind())).toList();
    }
}
