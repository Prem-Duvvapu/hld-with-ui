package com.hld.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.hld.retries.RetryResult.Kind;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import tools.jackson.databind.ObjectMapper;

/** Request/attempt ownership extends one family without reinterpreting delivery or old selectors. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
class RetryGuidedTargetTest {
    @Autowired ObjectMapper mapper;
    private static boolean requestScoped(Kind kind) {
        return kind == Kind.REQUEST_ARRIVED || kind == Kind.REQUEST_SUCCEEDED || kind == Kind.REQUEST_FAILED;
    }
    private static GuidedCheckpoint.Target target(String request, String attempt, String kind, int occurrence) {
        return new GuidedCheckpoint.Target(null, null, null, attempt, null, null, request, kind, occurrence);
    }

    @Test void everyActualKindRequiresExactlyItsPublishedIdentityCategory() {
        int requestKinds = 0, attemptKinds = 0;
        for (Kind kind : Kind.values()) {
            boolean scoped = requestScoped(kind);
            var valid = target("a", scoped ? null : "a-a1", kind.name(), 1);
            assertThat(valid.requestId()).isEqualTo("a");
            assertThat(valid.attemptId()).isEqualTo(scoped ? null : "a-a1");
            assertThat(valid.messageId()).isNull();
            assertThat(valid.operation()).isNull(); assertThat(valid.jobId()).isNull();
            assertThat(valid.operationId()).isNull(); assertThat(valid.stepId()).isNull();
            assertThatIllegalArgumentException().isThrownBy(() -> target("a", scoped ? "a-a1" : null, kind.name(), 1));
            if (scoped) requestKinds++; else attemptKinds++;
        }
        assertThat(requestKinds).isEqualTo(3); assertThat(attemptKinds).isEqualTo(8);
    }

    @Test void retryIdsKindsOccurrencesAndMatchingAttemptOwnershipAreClosedAndBounded() {
        for (String request : new String[]{null, "", "A", "1a", "a\n", "a ", " a", "é", "a".repeat(33)})
            assertThatIllegalArgumentException().isThrownBy(() -> target(request, "a-a1", "ATTEMPT_SENT", 1));
        for (String attempt : new String[]{null, "", "b-a1", "a-a0", "a-a6", "a-a10", "a-a1\n", "a-a1 ", " a-a1"})
            assertThatIllegalArgumentException().isThrownBy(() -> target("a", attempt, "ATTEMPT_SENT", 1));
        for (String kind : new String[]{null, "", "UNKNOWN", "ATTEMPT_SENT\n", "attempt.sent", "cache.fill", "ack.sent", "RESERVATION_ACCEPTED"})
            assertThatIllegalArgumentException().isThrownBy(() -> target("a", "a-a1", kind, 1));
        for (int occurrence : new int[]{-1, 0, 385, 10000})
            assertThatIllegalArgumentException().isThrownBy(() -> target("a", "a-a1", "ATTEMPT_SENT", occurrence));
        String longest = "a".repeat(32);
        assertThat(target(longest, longest + "-a5", "ATTEMPT_SENT", 384).attemptId()).hasSize(35);
        assertThat(target(longest, null, "REQUEST_SUCCEEDED", 384).requestId()).hasSize(32);
    }

    @Test void retrySelectorsRejectEachMixedFamilyAndOrphanAttemptWithoutChangingDelivery() {
        for (var fields : List.of(
                new Object[]{1, null, null, null, null},
                new Object[]{null, "job-1", null, null, null},
                new Object[]{null, null, "a", null, null},
                new Object[]{null, null, null, "q1", null},
                new Object[]{null, null, null, null, "read-a"})) {
            assertThatIllegalArgumentException().isThrownBy(() -> new GuidedCheckpoint.Target(
                    (Integer) fields[0], (String) fields[1], (String) fields[2], "a-a1",
                    (String) fields[3], (String) fields[4], "a", "ATTEMPT_SENT", 1));
        }
        assertThatIllegalArgumentException().isThrownBy(() -> target(null, "a-a1", "ATTEMPT_SENT", 1));
        assertThatIllegalArgumentException().isThrownBy(() -> target(null, "a-a1", "REQUEST_FAILED", 1));
        var oldDelivery = new GuidedCheckpoint.Target(null, null, "a", "a-a1", "ack.sent", 1);
        assertThat(oldDelivery.requestId()).isNull();
        assertThat(oldDelivery.messageId()).isEqualTo("a");
        assertThatIllegalArgumentException().isThrownBy(() -> new GuidedCheckpoint.Target(null, null, "a", "a-a1", "ATTEMPT_SENT", 1));
        assertThatIllegalArgumentException().isThrownBy(() -> target("a", "a-a1", "ack.sent", 1));
    }

    @Test void bothRetryWireCategoriesRoundTripWithoutNullSelectorsAndOldConstructorsStayUnchanged() {
        for (Kind kind : Kind.values()) {
            var value = target("a", requestScoped(kind) ? null : "a-a1", kind.name(), 1);
            byte[] json = mapper.writeValueAsBytes(value);
            assertThat(mapper.readValue(json, GuidedCheckpoint.Target.class)).isEqualTo(value);
            var fields = mapper.readTree(json).propertyNames();
            if (requestScoped(kind)) assertThat(fields).containsExactlyInAnyOrder("requestId", "kind", "occurrence");
            else assertThat(fields).containsExactlyInAnyOrder("requestId", "attemptId", "kind", "occurrence");
        }
        for (var old : List.of(new GuidedCheckpoint.Target(1, null, "cache.fill", 1),
                new GuidedCheckpoint.Target(null, "job-1", "job.started", 1),
                new GuidedCheckpoint.Target(null, null, "m1", "m1-a1", "ack.stale", 1),
                new GuidedCheckpoint.Target(null, null, null, null, "q1", "TENANT_RANGE", 1),
                new GuidedCheckpoint.Target(null, null, null, null, null, "read-a", "READ_OBSERVED", 1))) {
            assertThat(old.requestId()).isNull();
            assertThat(mapper.readTree(mapper.writeValueAsBytes(old)).has("requestId")).isFalse();
        }
    }

    @Test void malformedRetryWireTargetsCannotAcquireAnotherFamilyOrIgnoreUnknownFields() {
        for (String json : List.of(
                "{\"requestId\":null,\"attemptId\":\"a-a1\",\"kind\":\"ATTEMPT_SENT\",\"occurrence\":1}",
                "{\"attemptId\":\"a-a1\",\"kind\":\"ATTEMPT_SENT\",\"occurrence\":1}",
                "{\"requestId\":\"a\",\"kind\":\"ATTEMPT_SENT\",\"occurrence\":1}",
                "{\"requestId\":\"a\",\"attemptId\":\"a-a1\",\"kind\":\"REQUEST_FAILED\",\"occurrence\":1}",
                "{\"requestId\":\"a\",\"attemptId\":\"b-a1\",\"kind\":\"ATTEMPT_SENT\",\"occurrence\":1}",
                "{\"requestId\":\"a\",\"kind\":\"REQUEST_FAILED\",\"occurrence\":385}",
                "{\"requestId\":\"a\",\"kind\":\"REQUEST_FAILED\"}",
                "{\"requestId\":\"a\",\"kind\":\"REQUEST_FAILED\",\"occurrence\":1,\"operation\":1}",
                "{\"requestId\":\"a\",\"kind\":\"REQUEST_FAILED\",\"occurrence\":1,\"jobId\":\"job-1\"}",
                "{\"requestId\":\"a\",\"kind\":\"REQUEST_FAILED\",\"occurrence\":1,\"operationId\":\"q1\"}",
                "{\"requestId\":\"a\",\"kind\":\"REQUEST_FAILED\",\"occurrence\":1,\"stepId\":\"read-a\"}",
                "{\"requestId\":\"a\",\"kind\":\"REQUEST_FAILED\",\"occurrence\":1,\"messageId\":\"a\"}",
                "{\"requestId\":\"a\",\"kind\":\"UNKNOWN\",\"occurrence\":1}",
                "{\"requestId\":[],\"kind\":\"REQUEST_FAILED\",\"occurrence\":1}",
                "{\"requestId\":\"a\",\"kind\":\"REQUEST_FAILED\",\"occurrence\":1,\"unknown\":true}"))
            assertThatThrownBy(() -> mapper.readValue(json, GuidedCheckpoint.Target.class)).as(json).isInstanceOf(RuntimeException.class);
    }
}
