package com.hld.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

import org.junit.jupiter.api.Test;

class GuidedCheckpointTargetTest {
    @Test void selectsExactlyOneCacheOperationOrQueueJob() {
        var cache = new GuidedCheckpoint.Target(1, null, "cache.fill", 1);
        assertThat(cache.operation()).isEqualTo(1);
        assertThat(cache.jobId()).isNull();
        var queue = new GuidedCheckpoint.Target(null, "job-1", "job.started", 1);
        assertThat(queue.operation()).isNull();
        assertThat(queue.jobId()).isEqualTo("job-1");
        assertThatIllegalArgumentException().isThrownBy(() ->
                new GuidedCheckpoint.Target(null, null, "job.started", 1));
        assertThatIllegalArgumentException().isThrownBy(() ->
                new GuidedCheckpoint.Target(1, "job-1", "job.started", 1));
    }

    @Test void rejectsSelectorsThatCannotResolveToSupportedIdentitiesOrOccurrences() {
        for (int operation : new int[] {0, -1}) {
            assertThatIllegalArgumentException().isThrownBy(() ->
                    new GuidedCheckpoint.Target(operation, null, "cache.fill", 1));
        }
        for (String jobId : new String[] {"", "Job-1", "job!1", "x".repeat(33), "job-1\n"}) {
            assertThatIllegalArgumentException().isThrownBy(() ->
                    new GuidedCheckpoint.Target(null, jobId, "job.started", 1));
        }
        for (String kind : new String[] {null, "", " ", "job", "JOB.started", "job.started!", "job.started\n"}) {
            assertThatIllegalArgumentException().isThrownBy(() ->
                    new GuidedCheckpoint.Target(null, "job-1", kind, 1));
        }
        for (int occurrence : new int[] {0, -1}) {
            assertThatIllegalArgumentException().isThrownBy(() ->
                    new GuidedCheckpoint.Target(null, "job-1", "job.started", occurrence));
        }
    }
}
