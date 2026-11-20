package com.hld.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.hld.idempotency.IdempotencyResult.Kind;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import tools.jackson.databind.ObjectMapper;

/** Idempotency extends the closed step family, preserving existing wire identities. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
class IdempotencyGuidedTargetTest {
    @Autowired ObjectMapper mapper;

    private static GuidedCheckpoint.Target target(String step, String kind, int occurrence) {
        return new GuidedCheckpoint.Target(null, null, null, null, null, step, kind, occurrence);
    }

    @Test void allSixteenActualIdempotencyKindsUseOnlyStepKindAndSingleOccurrence() {
        assertThat(Kind.values()).hasSize(16);
        for (Kind kind : Kind.values()) {
            var value = target("save-b", kind.name(), 1);
            assertThat(value.stepId()).isEqualTo("save-b");
            assertThat(value.kind()).isEqualTo(kind.name());
            assertThat(value.occurrence()).isEqualTo(1);
            assertThat(value.operation()).isNull(); assertThat(value.jobId()).isNull();
            assertThat(value.messageId()).isNull(); assertThat(value.attemptId()).isNull();
            assertThat(value.operationId()).isNull(); assertThat(value.requestId()).isNull();
            byte[] json = mapper.writeValueAsBytes(value);
            assertThat(mapper.readTree(json).propertyNames()).containsExactlyInAnyOrder("stepId", "kind", "occurrence");
            assertThat(mapper.readValue(json, GuidedCheckpoint.Target.class)).isEqualTo(value);
        }
        assertThat(target("s".repeat(32), "ATOMIC_COMMITTED", 1).stepId()).hasSize(32);
    }

    @Test void malformedIdentityKindOccurrenceAndEveryMixedSelectorGroupReject() {
        for (String step : new String[]{null, "", "Save-b", "1s", "s\n", "s ", " s", "é", "s".repeat(33)})
            assertThatIllegalArgumentException().isThrownBy(() -> target(step, "ATOMIC_COMMITTED", 1));
        for (String kind : new String[]{null, "", "UNKNOWN", "atomic.committed", "ATOMIC_COMMITTED\n", "REQUEST_SUCCEEDED", "TENANT_RANGE", "ack.sent", "cache.fill"})
            assertThatIllegalArgumentException().isThrownBy(() -> target("save-b", kind, 1));
        for (int occurrence : new int[]{-1, 0, 2, 48, 10000})
            assertThatIllegalArgumentException().isThrownBy(() -> target("save-b", "ATOMIC_COMMITTED", occurrence));
        for (var values : List.of(
                new Object[]{1, null, null, null, null, null},
                new Object[]{null, "job-1", null, null, null, null},
                new Object[]{null, null, "a", "a-a1", null, null},
                new Object[]{null, null, null, "a-a1", null, null},
                new Object[]{null, null, null, null, "q1", null},
                new Object[]{null, null, null, null, null, "a"})) {
            assertThatIllegalArgumentException().isThrownBy(() -> new GuidedCheckpoint.Target(
                    (Integer) values[0], (String) values[1], (String) values[2], (String) values[3],
                    (String) values[4], "save-b", (String) values[5], "ATOMIC_COMMITTED", 1));
        }
    }

    @Test void configuredMapperRejectsMissingUnknownWrongTypedAndMixedStepWireValues() {
        for (String json : List.of(
                "{\"stepId\":null,\"kind\":\"ATOMIC_COMMITTED\",\"occurrence\":1}",
                "{\"stepId\":[],\"kind\":\"ATOMIC_COMMITTED\",\"occurrence\":1}",
                "{\"stepId\":{},\"kind\":\"ATOMIC_COMMITTED\",\"occurrence\":1}",
                "{\"kind\":\"ATOMIC_COMMITTED\",\"occurrence\":1}",
                "{\"stepId\":\"save-a\",\"kind\":\"ATOMIC_COMMITTED\"}",
                "{\"stepId\":\"save-a\",\"kind\":\"ATOMIC_COMMITTED\",\"occurrence\":2}",
                "{\"stepId\":\"save-a\",\"kind\":\"UNKNOWN\",\"occurrence\":1}",
                "{\"stepId\":\"save-a\",\"kind\":\"ATOMIC_COMMITTED\",\"occurrence\":1,\"operation\":1}",
                "{\"stepId\":\"save-a\",\"kind\":\"ATOMIC_COMMITTED\",\"occurrence\":1,\"jobId\":\"job-1\"}",
                "{\"stepId\":\"save-a\",\"kind\":\"ATOMIC_COMMITTED\",\"occurrence\":1,\"operationId\":\"q1\"}",
                "{\"stepId\":\"save-a\",\"kind\":\"ATOMIC_COMMITTED\",\"occurrence\":1,\"requestId\":\"a\"}",
                "{\"stepId\":\"save-a\",\"kind\":\"ATOMIC_COMMITTED\",\"occurrence\":1,\"messageId\":\"a\",\"attemptId\":\"a-a1\"}",
                "{\"stepId\":\"save-a\",\"kind\":\"ATOMIC_COMMITTED\",\"occurrence\":1,\"invented\":true}"))
            assertThatThrownBy(() -> mapper.readValue(json, GuidedCheckpoint.Target.class)).as(json).isInstanceOf(RuntimeException.class);
    }

    @Test void preexistingSourceConstructorsAndEveryExistingStepKindRemainSupported() {
        for (var old : List.of(new GuidedCheckpoint.Target(1, null, "cache.fill", 1),
                new GuidedCheckpoint.Target(null, "job-1", "job.started", 1),
                new GuidedCheckpoint.Target(null, null, "a", "a-a1", "ack.stale", 1),
                new GuidedCheckpoint.Target(null, null, null, null, "q1", "TENANT_RANGE", 1),
                new GuidedCheckpoint.Target(null, null, null, null, null, "read-a", "READ_OBSERVED", 1),
                new GuidedCheckpoint.Target(null, null, null, "a-a1", null, null, "a", "ATTEMPT_SENT", 1))) {
            byte[] json = mapper.writeValueAsBytes(old);
            assertThat(mapper.readValue(json, GuidedCheckpoint.Target.class)).isEqualTo(old);
        }
        for (var kind : com.hld.transactions.ReservationResult.Kind.values())
            assertThat(target("read-a", kind.name(), 1).kind()).isEqualTo(kind.name());
        for (var kind : com.hld.atomicity.AtomicityResult.Kind.values())
            assertThat(target("commit-a", kind.name(), 1).kind()).isEqualTo(kind.name());
    }
}
