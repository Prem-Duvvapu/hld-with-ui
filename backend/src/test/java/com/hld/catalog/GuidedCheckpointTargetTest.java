package com.hld.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

import org.junit.jupiter.api.Test;

class GuidedCheckpointTargetTest {
    @Test
    void selectsExactlyOneCacheOperationOrQueueJob() {
        var cache = new GuidedCheckpoint.Target(1, null, "cache.fill", 1);
        assertThat(cache.operation()).isEqualTo(1);
        assertThat(cache.jobId()).isNull();
        var queue = new GuidedCheckpoint.Target(null, "job-1", "job.started", 1);
        assertThat(queue.operation()).isNull();
        assertThat(queue.jobId()).isEqualTo("job-1");
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new GuidedCheckpoint.Target(null, null, "job.started", 1));
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new GuidedCheckpoint.Target(1, "job-1", "job.started", 1));
    }

    @Test
    void rejectsSelectorsThatCannotResolveToSupportedIdentitiesOrOccurrences() {
        for (int operation : new int[] {0, -1}) {
            assertThatIllegalArgumentException()
                    .isThrownBy(
                            () -> new GuidedCheckpoint.Target(operation, null, "cache.fill", 1));
        }
        for (String jobId : new String[] {"", "Job-1", "job!1", "x".repeat(33), "job-1\n"}) {
            assertThatIllegalArgumentException()
                    .isThrownBy(() -> new GuidedCheckpoint.Target(null, jobId, "job.started", 1));
        }
        for (String kind :
                new String[] {
                    null, "", " ", "job", "JOB.started", "job.started!", "job.started\n"
                }) {
            assertThatIllegalArgumentException()
                    .isThrownBy(() -> new GuidedCheckpoint.Target(null, "job-1", kind, 1));
        }
        for (int occurrence : new int[] {0, -1}) {
            assertThatIllegalArgumentException()
                    .isThrownBy(
                            () ->
                                    new GuidedCheckpoint.Target(
                                            null, "job-1", "job.started", occurrence));
        }
    }

    @Test
    void deliveryTargetsRequireAMatchingPairAndOneSelectorGroup() {
        var target = new GuidedCheckpoint.Target(null, null, "m1", "m1-a1", "effect.committed", 1);
        assertThat(target.operation()).isNull();
        assertThat(target.jobId()).isNull();
        assertThat(target.messageId()).isEqualTo("m1");
        assertThat(target.attemptId()).isEqualTo("m1-a1");
        for (String[] pair :
                new String[][] {
                    {"m1", null},
                    {null, "m1-a1"},
                    {"m1", "m10-a1"},
                    {"m1", "m1-a0"},
                    {"m1", "m1-a6"},
                    {"m1", "m1-a10"},
                    {"m1", "m1-a1\n"},
                    {"M1", "M1-a1"},
                    {"m1\n", "m1\n-a1"}
                }) {
            assertThatIllegalArgumentException()
                    .isThrownBy(
                            () ->
                                    new GuidedCheckpoint.Target(
                                            null, null, pair[0], pair[1], "effect.committed", 1));
        }
        assertThatIllegalArgumentException()
                .isThrownBy(
                        () ->
                                new GuidedCheckpoint.Target(
                                        1, null, "m1", "m1-a1", "effect.committed", 1));
        assertThatIllegalArgumentException()
                .isThrownBy(
                        () ->
                                new GuidedCheckpoint.Target(
                                        null, "job-1", "m1", "m1-a1", "effect.committed", 1));
        String longest = "m" + "x".repeat(31);
        assertThat(
                        new GuidedCheckpoint.Target(
                                        null, null, longest, longest + "-a5", "delivery.started", 1)
                                .messageId())
                .isEqualTo(longest);
        String tooLong = longest + "x";
        assertThatIllegalArgumentException()
                .isThrownBy(
                        () ->
                                new GuidedCheckpoint.Target(
                                        null,
                                        null,
                                        tooLong,
                                        tooLong + "-a1",
                                        "delivery.started",
                                        1));
    }

    @Test
    void deliveryKindsAreAttemptBearingAndSupportTheDeadLetterHyphen() {
        for (String kind :
                new String[] {
                    "delivery.started",
                    "effect.committed",
                    "ack.sent",
                    "ack.accepted",
                    "ack.lost",
                    "ack.stale",
                    "lease.expired",
                    "message.requeued",
                    "message.dead-lettered",
                    "attempt.cancelled"
                }) {
            assertThat(new GuidedCheckpoint.Target(null, null, "m1", "m1-a1", kind, 1).kind())
                    .isEqualTo(kind);
        }
        for (String kind :
                new String[] {
                    null,
                    "",
                    "message.enqueued",
                    "consumer.crashed",
                    "consumer.recovered",
                    "job.started",
                    "cache.fill",
                    "message.unknown",
                    "message.dead-lettered\n"
                }) {
            assertThatIllegalArgumentException()
                    .isThrownBy(
                            () -> new GuidedCheckpoint.Target(null, null, "m1", "m1-a1", kind, 1));
        }
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new GuidedCheckpoint.Target(1, null, "message.dead-lettered", 1));
        assertThatIllegalArgumentException()
                .isThrownBy(
                        () ->
                                new GuidedCheckpoint.Target(
                                        null, "job-1", "message.dead-lettered", 1));
    }

    @Test
    void deliveryOccurrenceUsesTheDefaultEventCeilingWhileLegacyRulesRemainPositive() {
        assertThat(
                        new GuidedCheckpoint.Target(null, null, "m1", "m1-a1", "ack.stale", 10_000)
                                .occurrence())
                .isEqualTo(10_000);
        for (int occurrence : new int[] {-1, 0, 10_001}) {
            assertThatIllegalArgumentException()
                    .isThrownBy(
                            () ->
                                    new GuidedCheckpoint.Target(
                                            null, null, "m1", "m1-a1", "ack.stale", occurrence));
        }
        assertThat(new GuidedCheckpoint.Target(1, null, "cache.fill", 10_001).occurrence())
                .isEqualTo(10_001);
        assertThat(new GuidedCheckpoint.Target(null, "job-1", "job.started", 10_001).occurrence())
                .isEqualTo(10_001);
    }

    @Test
    void analysisTargetsSelectEveryActualOutcomeKindWithOneOccurrence() {
        for (var kind : com.hld.dataaccess.DataAccessInput.Kind.values()) {
            var target = new GuidedCheckpoint.Target(null, null, null, null, "query-1", kind.name(), 1);
            assertThat(target.operationId()).isEqualTo("query-1");
            assertThat(target.kind()).isEqualTo(kind.name());
            assertThat(target.occurrence()).isEqualTo(1);
            assertThat(target.operation()).isNull();
            assertThat(target.jobId()).isNull();
            assertThat(target.messageId()).isNull();
            assertThat(target.attemptId()).isNull();
        }
        assertThat(new GuidedCheckpoint.Target(null, null, null, null, "q" + "x".repeat(31), "LOOKUP_ID", 1).operationId())
                .hasSize(32);
    }

    @Test
    void analysisTargetRejectsInvalidIdsKindsRepeatedOccurrencesAndMixedFamilies() {
        for (String id : new String[] {"", "Q1", "1q", "q!", "q ", "q\n", "q".repeat(33), "é"})
            assertThatIllegalArgumentException().isThrownBy(() -> new GuidedCheckpoint.Target(null, null, null, null, id, "TENANT_RANGE", 1));
        for (String kind : new String[] {null, "", "tenant_range", "TENANT_RANGE\n", "UNKNOWN", "cache.fill", "job.started", "ack.stale"})
            assertThatIllegalArgumentException().isThrownBy(() -> new GuidedCheckpoint.Target(null, null, null, null, "q1", kind, 1));
        for (int occurrence : new int[] {-1, 0, 2, 10_000})
            assertThatIllegalArgumentException().isThrownBy(() -> new GuidedCheckpoint.Target(null, null, null, null, "q1", "TENANT_RANGE", occurrence));
        assertThatIllegalArgumentException().isThrownBy(() -> new GuidedCheckpoint.Target(1, null, null, null, "q1", "TENANT_RANGE", 1));
        assertThatIllegalArgumentException().isThrownBy(() -> new GuidedCheckpoint.Target(null, "job-1", null, null, "q1", "TENANT_RANGE", 1));
        assertThatIllegalArgumentException().isThrownBy(() -> new GuidedCheckpoint.Target(null, null, "m1", "m1-a1", "q1", "TENANT_RANGE", 1));
        assertThatIllegalArgumentException().isThrownBy(() -> new GuidedCheckpoint.Target(null, null, "m1", null, "q1", "TENANT_RANGE", 1));
        assertThatIllegalArgumentException().isThrownBy(() -> new GuidedCheckpoint.Target(null, null, null, null, null, "TENANT_RANGE", 1));
    }

    @Test
    void oldSourceConstructorsStillSelectOnlyTheirExistingFamily() {
        assertThat(new GuidedCheckpoint.Target(1, null, "cache.fill", 1).operationId()).isNull();
        assertThat(new GuidedCheckpoint.Target(null, "job-1", "job.started", 1).operationId()).isNull();
        assertThat(new GuidedCheckpoint.Target(null, null, "m1", "m1-a1", "ack.stale", 1).operationId()).isNull();
        assertThat(new GuidedCheckpoint.Target(1, null, "cache.fill", 10_001).occurrence()).isEqualTo(10_001);
        assertThat(new GuidedCheckpoint.Target(null, "job-1", "job.started", 10_001).occurrence()).isEqualTo(10_001);
    }

    @Test void reservationTargetsSupportAllActualKindsAndPreserveEveryLegacyConstructor() {
        for (var kind : com.hld.transactions.ReservationResult.Kind.values()) {
            var target = new GuidedCheckpoint.Target(null, null, null, null, null, "attempt-b", kind.name(), 1);
            assertThat(target.stepId()).isEqualTo("attempt-b");
            assertThat(target.kind()).isEqualTo(kind.name());
            assertThat(target.operationId()).isNull();
        }
        assertThat(new GuidedCheckpoint.Target(null, null, null, null, null, "s" + "x".repeat(31), "READ_OBSERVED", 1).stepId()).hasSize(32);
        assertThat(new GuidedCheckpoint.Target(1, null, "cache.fill", 1).stepId()).isNull();
        assertThat(new GuidedCheckpoint.Target(null, "job-1", "job.started", 1).stepId()).isNull();
        assertThat(new GuidedCheckpoint.Target(null, null, "m1", "m1-a1", "ack.stale", 1).stepId()).isNull();
        assertThat(new GuidedCheckpoint.Target(null, null, null, null, "q1", "TENANT_RANGE", 1).stepId()).isNull();
    }

    @Test void reservationTargetsRejectUnsupportedIdentityKindOccurrenceAndEveryMixedFamily() {
        for (String id : new String[] {"", "Step", "1s", "s\n", "s ", "s".repeat(33), "é"})
            assertThatIllegalArgumentException().isThrownBy(() -> new GuidedCheckpoint.Target(null, null, null, null, null, id, "READ_OBSERVED", 1));
        for (String kind : new String[] {null, "", "UNKNOWN", "read.observed", "READ_OBSERVED\n", "TENANT_RANGE", "cache.fill", "ack.stale"})
            assertThatIllegalArgumentException().isThrownBy(() -> new GuidedCheckpoint.Target(null, null, null, null, null, "read-b", kind, 1));
        for (int occurrence : new int[] {-1, 0, 2, 10_000})
            assertThatIllegalArgumentException().isThrownBy(() -> new GuidedCheckpoint.Target(null, null, null, null, null, "read-b", "READ_OBSERVED", occurrence));
        assertThatIllegalArgumentException().isThrownBy(() -> new GuidedCheckpoint.Target(1, null, null, null, null, "read-b", "READ_OBSERVED", 1));
        assertThatIllegalArgumentException().isThrownBy(() -> new GuidedCheckpoint.Target(null, "job-1", null, null, null, "read-b", "READ_OBSERVED", 1));
        assertThatIllegalArgumentException().isThrownBy(() -> new GuidedCheckpoint.Target(null, null, "m1", "m1-a1", null, "read-b", "READ_OBSERVED", 1));
        assertThatIllegalArgumentException().isThrownBy(() -> new GuidedCheckpoint.Target(null, null, null, null, "q1", "read-b", "READ_OBSERVED", 1));
        assertThatIllegalArgumentException().isThrownBy(() -> new GuidedCheckpoint.Target(null, null, null, null, null, null, "READ_OBSERVED", 1));
    }
}
