package com.hld.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.hld.catalog.CatalogService;
import com.hld.catalog.GuidedCheckpoint;
import com.hld.queues.QueueCapacityDescriptor.Preset;
import com.hld.queues.QueueCapacityEvent;
import com.hld.queues.QueueCapacityEvent.Kind;
import com.hld.queues.QueueCapacityOutcome;
import com.hld.queues.QueueCapacityOutcome.Status;
import com.hld.queues.QueueCapacityResult;
import com.hld.queues.QueueCapacitySimulator;
import com.hld.queues.QueueCapacityState.Worker;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import tools.jackson.databind.ObjectMapper;

/** Authored checkpoints must resolve to the real Java transitions and populations they teach. */
@SpringBootTest
class QueueGuidedCheckpointsTest {
    @Autowired CatalogService catalog;
    @Autowired QueueCapacityController controller;
    @Autowired QueueCapacitySimulator simulator;
    @Autowired ObjectMapper mapper;

    record Resolved(GuidedCheckpoint checkpoint, Preset preset,
                    QueueCapacityResult result, QueueCapacityEvent event) {}

    private Resolved resolve(String id, String presetId, String jobId, Kind kind) {
        GuidedCheckpoint checkpoint = catalog.draftTopic("queues-tail-latency").checkpoints().stream()
                .filter(candidate -> candidate.id().equals(id)).findFirst().orElseThrow();
        assertThat(checkpoint.simulationId()).isEqualTo(QueueCapacitySimulator.SIMULATION_ID);
        assertThat(checkpoint.presetId()).isEqualTo(presetId);
        assertThat(checkpoint.target().operation()).isNull();
        assertThat(checkpoint.target().jobId()).isEqualTo(jobId);
        assertThat(checkpoint.target().kind()).isEqualTo(kind.value());
        assertThat(checkpoint.target().occurrence()).isEqualTo(1);
        Preset preset = controller.descriptor().presets().stream()
                .filter(candidate -> candidate.id().equals(checkpoint.presetId())).findFirst().orElseThrow();
        QueueCapacityResult result = simulator.run(preset.input());
        assertThat(result.status()).isEqualTo(presetId.equals("virtual-limit") ? "limited" : "completed");
        List<QueueCapacityEvent> matches = result.events().stream()
                .filter(event -> event.jobId().equals(checkpoint.target().jobId())
                        && event.kind().value().equals(checkpoint.target().kind())).toList();
        assertThat(matches).as(id + " semantic target").hasSize(1);
        assertThat(result.modelVersion()).isEqualTo("1.0.0");
        assertThat(result.outcomes()).hasSize(preset.input().jobs().size());
        for (var inputJob : preset.input().jobs()) {
            var outcome = outcome(result, inputJob.id());
            assertThat(outcome.arrivalTimeMs()).isEqualTo(inputJob.arrivalTimeMs());
            assertThat(outcome.serviceTimeMs()).isEqualTo(inputJob.serviceTimeMs());
        }
        var metrics = result.metrics();
        assertThat(metrics.completed() + metrics.rejected() + metrics.queued()
                + metrics.running() + metrics.notArrived()).isEqualTo(preset.input().jobs().size());
        return new Resolved(checkpoint, preset, result, matches.get(0));
    }

    private static QueueCapacityOutcome outcome(QueueCapacityResult result, String jobId) {
        return result.outcomes().stream().filter(job -> job.jobId().equals(jobId)).findFirst().orElseThrow();
    }

    private static Worker worker(QueueCapacityEvent event, String workerId) {
        return event.state().workers().stream().filter(worker -> worker.id().equals(workerId))
                .findFirst().orElseThrow();
    }

    @Test void idleWorkerStartsBeforeUsingWaitingSpace() {
        var r = resolve("workers-before-wait", "baseline", "job-1", Kind.STARTED);
        assertThat(r.event().timeMs()).isZero();
        assertThat(r.event().workerId()).isEqualTo("worker-1");
        assertThat(r.event().state().queuedJobIds()).isEmpty();
        assertThat(worker(r.event(), "worker-1")).isEqualTo(new Worker("worker-1", "job-1", 0L, 10L));
        assertThat(outcome(r.result(), "job-1").waitTimeMs()).isZero();
        assertThat(outcome(r.result(), "job-1").terminalTimeMs()).isEqualTo(10);
        assertThat(r.checkpoint().explanation()).contains("0 ms", "10 ms");
    }

    @Test void oneSharedWaitingSlotRetainsTheJobOutsideTheWorkerPool() {
        var r = resolve("shared-waiting", "baseline", "job-2", Kind.QUEUED);
        assertThat(r.preset().input().queueCapacity()).isEqualTo(1);
        assertThat(r.event().timeMs()).isZero();
        assertThat(r.event().workerId()).isNull();
        assertThat(r.event().state().queuedJobIds()).containsExactly("job-2");
        assertThat(worker(r.event(), "worker-1").jobId()).isEqualTo("job-1");
        assertThat(outcome(r.result(), "job-2").startTimeMs()).isEqualTo(10);
        assertThat(outcome(r.result(), "job-2").waitTimeMs()).isEqualTo(10);
        assertThat(outcome(r.result(), "job-2").latencyMs()).isEqualTo(20);
        assertThat(r.checkpoint().explanation()).contains("10 - 0 = 10 ms", "20 - 10 = 10 ms", "20 - 0 = 20 ms");
    }

    @Test void fullWaitingBufferRejectsRatherThanInventingSuccessfulZeroLatency() {
        var r = resolve("full-buffer-rejection", "baseline", "job-3", Kind.REJECTED);
        assertThat(r.event().timeMs()).isZero();
        assertThat(r.event().state().queuedJobIds()).containsExactly("job-2");
        assertThat(worker(r.event(), "worker-1").jobId()).isEqualTo("job-1");
        var rejected = outcome(r.result(), "job-3");
        assertThat(rejected.status()).isEqualTo(Status.REJECTED);
        assertThat(rejected.terminalTimeMs()).isZero();
        assertThat(rejected.startTimeMs()).isNull();
        assertThat(rejected.waitTimeMs()).isNull();
        assertThat(rejected.latencyMs()).isNull();
        assertThat(r.result().metrics().completed()).isEqualTo(2);
        assertThat(r.result().metrics().rejected()).isEqualTo(2);
        assertThat(r.result().metrics().successfulSamples()).isEqualTo(2);
        assertThat(r.result().metrics().meanSuccessfulLatencyMs()).isEqualTo(15);
        assertThat(r.result().metrics().p95SuccessfulLatencyMs()).isEqualTo(20);
        assertThat(r.checkpoint().explanation()).contains("2 completed jobs", "2 rejected jobs", "mean 15 ms", "p95 20 ms", "2 samples");
    }

    @Test void completionFreesWorkerBeforeFifoDispatchAtTheSameTimestamp() {
        var r = resolve("completion-before-dispatch", "baseline", "job-2", Kind.STARTED);
        assertThat(r.event().timeMs()).isEqualTo(10);
        var preceding = r.result().events().get(r.event().sequence() - 2);
        assertThat(preceding.kind()).isEqualTo(Kind.COMPLETED);
        assertThat(preceding.jobId()).isEqualTo("job-1");
        assertThat(preceding.timeMs()).isEqualTo(10);
        assertThat(preceding.state().queuedJobIds()).containsExactly("job-2");
        assertThat(worker(preceding, "worker-1").jobId()).isNull();
        assertThat(r.event().state().queuedJobIds()).isEmpty();
        assertThat(worker(r.event(), "worker-1")).isEqualTo(new Worker("worker-1", "job-2", 10L, 20L));
        assertThat(r.checkpoint().explanation()).contains("At 10 ms", "job-1 completed", "job-2 started");
    }

    @Test void largerBufferChangesTheSuccessfulPopulationAndItsLatencyDistribution() {
        var r = resolve("larger-buffer-population", "larger-buffer", "job-4", Kind.COMPLETED);
        assertThat(r.preset().input().workers()).isEqualTo(1);
        assertThat(r.preset().input().queueCapacity()).isEqualTo(3);
        assertThat(r.event().timeMs()).isEqualTo(40);
        assertThat(r.result().outcomes()).extracting(QueueCapacityOutcome::latencyMs)
                .containsExactly(10L, 20L, 30L, 40L);
        assertThat(r.result().metrics().completed()).isEqualTo(4);
        assertThat(r.result().metrics().rejected()).isZero();
        assertThat(r.result().metrics().successfulSamples()).isEqualTo(4);
        assertThat(r.result().metrics().meanSuccessfulLatencyMs()).isEqualTo(25);
        assertThat(r.result().metrics().p95SuccessfulLatencyMs()).isEqualTo(40);
        assertThat(r.result().metrics().peakWaiting()).isEqualTo(3);
        assertThat(r.event().state().queuedJobIds()).isEmpty();
        assertThat(r.event().state().workers()).allMatch(worker -> worker.jobId() == null);
        assertThat(r.checkpoint().explanation()).contains("3 waiting slots", " / 4 = 25 ms", "p95 is 40 ms over 4 samples");
    }

    @Test void moreWorkersStartTwoJobsWithoutSpendingTheWaitingSlot() {
        var r = resolve("more-workers", "more-workers", "job-2", Kind.STARTED);
        assertThat(r.preset().input().workers()).isEqualTo(2);
        assertThat(r.preset().input().queueCapacity()).isEqualTo(1);
        assertThat(r.event().timeMs()).isZero();
        assertThat(r.event().workerId()).isEqualTo("worker-2");
        assertThat(r.event().state().queuedJobIds()).isEmpty();
        assertThat(worker(r.event(), "worker-1")).isEqualTo(new Worker("worker-1", "job-1", 0L, 10L));
        assertThat(worker(r.event(), "worker-2")).isEqualTo(new Worker("worker-2", "job-2", 0L, 10L));
        assertThat(r.result().metrics().completed()).isEqualTo(3);
        assertThat(r.result().metrics().rejected()).isEqualTo(1);
        assertThat(r.result().metrics().meanSuccessfulLatencyMs()).isEqualTo(40.0 / 3);
        assertThat(r.result().metrics().successfulSamples()).isEqualTo(3);
        assertThat(r.result().metrics().p95SuccessfulLatencyMs()).isEqualTo(20);
        assertThat(r.checkpoint().explanation()).contains("40 / 3 ms", "p95 is 20 ms over 3 samples");
    }

    @Test void slowHeadDelaysAOneMillisecondJobWithoutChangingItsOwnServiceTime() {
        var r = resolve("slow-head", "slow-job", "job-4", Kind.STARTED);
        assertThat(r.preset().input().jobs().get(0).serviceTimeMs()).isEqualTo(100);
        assertThat(r.event().timeMs()).isEqualTo(102);
        assertThat(worker(r.event(), "worker-1")).isEqualTo(new Worker("worker-1", "job-4", 102L, 103L));
        var last = outcome(r.result(), "job-4");
        assertThat(last.serviceTimeMs()).isEqualTo(1);
        assertThat(last.waitTimeMs()).isEqualTo(102);
        assertThat(last.terminalTimeMs()).isEqualTo(103);
        assertThat(last.latencyMs()).isEqualTo(103);
        assertThat(r.result().outcomes()).extracting(QueueCapacityOutcome::terminalTimeMs)
                .containsExactly(100L, 101L, 102L, 103L);
        assertThat(r.checkpoint().explanation()).contains("102 ms waiting plus 1 ms service equals 103 ms");
    }

    @Test void censoredTracePreservesScheduledWorkWithoutCallingItCompleted() {
        var r = resolve("censored-completion", "virtual-limit", "last-job", Kind.STARTED);
        assertThat(r.result().status()).isEqualTo("limited");
        assertThat(r.result().truncationReason()).isEqualTo("virtual_time_limit");
        assertThat(r.event().timeMs()).isEqualTo(60_000);
        assertThat(r.result().lastVirtualTimeMs()).isEqualTo(60_000);
        assertThat(worker(r.event(), "worker-1")).isEqualTo(new Worker("worker-1", "last-job", 60_000L, 70_000L));
        assertThat(r.result().events()).noneMatch(event -> event.kind() == Kind.COMPLETED);
        var last = outcome(r.result(), "last-job");
        assertThat(last.status()).isEqualTo(Status.RUNNING);
        assertThat(last.terminalTimeMs()).isNull();
        assertThat(last.latencyMs()).isNull();
        assertThat(r.result().metrics().completed()).isZero();
        assertThat(r.result().metrics().running()).isEqualTo(1);
        assertThat(r.result().metrics().successfulSamples()).isZero();
        assertThat(r.result().metrics().meanSuccessfulWaitMs()).isNull();
        assertThat(r.result().metrics().meanSuccessfulLatencyMs()).isNull();
        assertThat(r.result().metrics().p95SuccessfulLatencyMs()).isNull();
        assertThat(r.result().finalState()).isEqualTo(r.event().state());
        assertThat(r.checkpoint().explanation()).contains("60,000 ms", "70,000 ms", "0 completed jobs", "1 running job", "0 successful samples");
    }

    @Test void checkpointSetCoversEveryRealPresetWithUniqueSemanticTargets() {
        var checkpoints = catalog.draftTopic("queues-tail-latency").checkpoints();
        assertThat(checkpoints).extracting(GuidedCheckpoint::id).containsExactly(
                "workers-before-wait", "shared-waiting", "full-buffer-rejection", "completion-before-dispatch",
                "larger-buffer-population", "more-workers", "slow-head", "censored-completion");
        assertThat(checkpoints.stream().map(GuidedCheckpoint::presetId).distinct().toList())
                .containsExactlyElementsOf(controller.descriptor().presets().stream().map(Preset::id).toList());
    }

    @Test void configuredMapperPreservesCacheTargetWireShapeAndOmitsUnusedQueueSelector() {
        for (var checkpoint : catalog.topic("cache-aside").checkpoints()) {
            var json = mapper.readTree(mapper.writeValueAsBytes(checkpoint.target()));
            assertThat(json.propertyNames()).containsExactlyInAnyOrder("operation", "kind", "occurrence");
            assertThat(json.path("operation").asInt()).isEqualTo(checkpoint.target().operation());
            assertThat(mapper.readValue(mapper.writeValueAsBytes(checkpoint.target()), GuidedCheckpoint.Target.class))
                    .isEqualTo(checkpoint.target());
        }
        for (var checkpoint : catalog.draftTopic("queues-tail-latency").checkpoints()) {
            var json = mapper.readTree(mapper.writeValueAsBytes(checkpoint.target()));
            assertThat(json.propertyNames()).containsExactlyInAnyOrder("jobId", "kind", "occurrence");
            assertThat(json.path("jobId").asString()).isEqualTo(checkpoint.target().jobId());
            assertThat(mapper.readValue(mapper.writeValueAsBytes(checkpoint.target()), GuidedCheckpoint.Target.class))
                    .isEqualTo(checkpoint.target());
        }
    }
}
