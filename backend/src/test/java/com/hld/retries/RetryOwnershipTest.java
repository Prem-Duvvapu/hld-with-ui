package com.hld.retries;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.hld.retries.RetryInput.Request;
import com.hld.retries.RetryResult.*;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;

class RetryOwnershipTest {
    @Test void inputAndEverySnapshotCollectionDefensivelyOwnTheirContents() {
        var requests = new ArrayList<>(List.of(new Request("a", 0, 80)));
        var input = RetryTestInputs.configured(c -> c.requests = requests);
        requests.clear();
        assertThat(input.requests()).hasSize(1);
        assertThatThrownBy(() -> input.requests().clear()).isInstanceOf(UnsupportedOperationException.class);
        var result = new RetrySimulator().run(input);
        assertThatThrownBy(() -> result.events().clear()).isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> result.assumptions().clear()).isInstanceOf(UnsupportedOperationException.class);
        var states = new ArrayList<State>(); states.add(result.initialState()); states.add(result.finalState());
        result.events().forEach(e -> states.add(e.postState()));
        for (var state : states) {
            assertThatThrownBy(() -> state.requests().clear()).isInstanceOf(UnsupportedOperationException.class);
            assertThatThrownBy(() -> state.attempts().clear()).isInstanceOf(UnsupportedOperationException.class);
            assertThatThrownBy(() -> state.workers().clear()).isInstanceOf(UnsupportedOperationException.class);
            assertThatThrownBy(() -> state.queue().clear()).isInstanceOf(UnsupportedOperationException.class);
        }
        assertThat(result.initialState().requests().get(0).phase()).isEqualTo(Phase.NOT_ARRIVED);
        assertThat(result.initialState().attempts()).isEmpty();
        assertThat(result.events().get(0).postState().requests().get(0).phase()).isEqualTo(Phase.READY);
        assertThat(result.events().get(1).postState().attempts().get(0).workState()).isEqualTo(WorkState.PENDING_ADMISSION);
        assertThat(result.finalState().attempts()).allSatisfy(a -> assertThat(a.workState()).isEqualTo(WorkState.COMPLETED));
    }

    @Test void concurrentCallsToTheSameSimulatorHaveIndependentSchedulesBudgetsAndRandomStreams() throws Exception {
        var simulator = new RetrySimulator();
        var presets = RetryPresets.all();
        var expected = presets.stream().map(p -> simulator.run(p.input())).toList();
        var executor = Executors.newFixedThreadPool(4);
        try {
            List<Callable<RetryResult>> calls = new ArrayList<>();
            for (int i = 0; i < 24; i++) {
                var input = presets.get(i % presets.size()).input();
                calls.add(() -> simulator.run(input));
            }
            var results = executor.invokeAll(calls);
            for (int i = 0; i < results.size(); i++) assertThat(results.get(i).get()).isEqualTo(expected.get(i % expected.size()));
        } finally { executor.shutdownNow(); }
        for (int i = 0; i < presets.size(); i++) assertThat(simulator.run(presets.get(i).input())).isEqualTo(expected.get(i));
    }

    @Test void everyEventReferencesActualRowsAndQueueWorkerOwnershipAgreeWithReturnedWorkState() {
        for (var preset : RetryPresets.all()) {
            var result = new RetrySimulator().run(preset.input());
            int sequence = 0, time = 0;
            for (var event : result.events()) {
                assertThat(event.sequence()).isEqualTo(++sequence);
                assertThat(event.timeMs()).isGreaterThanOrEqualTo(time); time = event.timeMs();
                var state = event.postState();
                assertThat(state.requests()).extracting(RequestState::id).contains(event.requestId());
                if (event.attemptId() != null) assertThat(state.attempts()).extracting(AttemptState::id).contains(event.attemptId());
                var assigned = state.workers().stream().map(WorkerState::attemptId).filter(java.util.Objects::nonNull).toList();
                assertThat(assigned).doesNotHaveDuplicates();
                assertThat(state.queue()).doesNotHaveDuplicates();
                assertThat(java.util.Collections.disjoint(state.queue(), assigned)).isTrue();
                for (var attempt : state.attempts()) {
                    assertThat(state.queue().contains(attempt.id())).isEqualTo(attempt.workState() == WorkState.QUEUED);
                    assertThat(assigned.contains(attempt.id())).isEqualTo(attempt.workState() == WorkState.RUNNING);
                }
                if (event.kind() == Kind.REQUEST_SUCCEEDED || event.kind() == Kind.REQUEST_FAILED) assertThat(event.attemptId()).isNull();
            }
            assertThat(result.finalState().queue()).isEmpty();
            assertThat(result.finalState().workers()).allSatisfy(w -> assertThat(w.attemptId()).isNull());
            assertThat(result.events()).hasSizeLessThanOrEqualTo(RetryInput.MAX_EVENTS);
            assertThat(result.metrics().finalTimeMs()).isLessThanOrEqualTo(RetryInput.MAX_VIRTUAL_TIME_MS);
        }
    }
}
