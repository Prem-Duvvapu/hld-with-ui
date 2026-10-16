package com.hld.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import tools.jackson.databind.ObjectMapper;

/** Canonical-constructor expansion must not add null selectors to existing wire shapes. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
class GuidedTargetSerializationTest {
    @Autowired ObjectMapper mapper;

    @Test void allFiveFamiliesRoundTripWithExactlyTheirSelectedFields() {
        var cache = new GuidedCheckpoint.Target(1, null, "cache.fill", 1);
        var queue = new GuidedCheckpoint.Target(null, "job-1", "job.started", 1);
        var delivery = new GuidedCheckpoint.Target(null, null, "m1", "m1-a1", "ack.stale", 1);
        var analysis = new GuidedCheckpoint.Target(null, null, null, null, "q1", "TENANT_RANGE", 1);
        var reservation = new GuidedCheckpoint.Target(null, null, null, null, null, "read-b", "READ_OBSERVED", 1);
        var atomicity = new GuidedCheckpoint.Target(null, null, null, null, null, "commit-a", "TRANSACTION_COMMITTED", 1);
        for (var target : List.of(cache, queue, delivery, analysis, reservation, atomicity)) {
            byte[] json = mapper.writeValueAsBytes(target);
            assertThat(mapper.readValue(json, GuidedCheckpoint.Target.class)).isEqualTo(target);
        }
        assertThat(mapper.valueToTree(cache).propertyNames()).containsExactlyInAnyOrder("operation", "kind", "occurrence");
        assertThat(mapper.valueToTree(queue).propertyNames()).containsExactlyInAnyOrder("jobId", "kind", "occurrence");
        assertThat(mapper.valueToTree(delivery).propertyNames()).containsExactlyInAnyOrder("messageId", "attemptId", "kind", "occurrence");
        assertThat(mapper.valueToTree(analysis).propertyNames()).containsExactlyInAnyOrder("operationId", "kind", "occurrence");
        assertThat(mapper.valueToTree(reservation).propertyNames()).containsExactlyInAnyOrder("stepId", "kind", "occurrence");
        assertThat(mapper.valueToTree(atomicity).propertyNames()).containsExactlyInAnyOrder("stepId", "kind", "occurrence");
    }

    @Test void reservationTargetSerializationRejectsMalformedMissingUnknownAndMixedSelectors() {
        for (String json : List.of(
                "{\"stepId\":null,\"kind\":\"READ_OBSERVED\",\"occurrence\":1}",
                "{\"stepId\":[],\"kind\":\"READ_OBSERVED\",\"occurrence\":1}",
                "{\"stepId\":{},\"kind\":\"READ_OBSERVED\",\"occurrence\":1}",
                "{\"stepId\":\"read-b\",\"kind\":\"UNKNOWN\",\"occurrence\":1}",
                "{\"stepId\":\"read-b\",\"kind\":\"READ_OBSERVED\",\"occurrence\":2}",
                "{\"stepId\":\"read-b\",\"kind\":\"READ_OBSERVED\"}",
                "{\"stepId\":\"read-b\",\"kind\":\"READ_OBSERVED\",\"occurrence\":1,\"operation\":1}",
                "{\"stepId\":\"read-b\",\"kind\":\"READ_OBSERVED\",\"occurrence\":1,\"jobId\":\"job-1\"}",
                "{\"stepId\":\"read-b\",\"kind\":\"READ_OBSERVED\",\"occurrence\":1,\"messageId\":\"m1\",\"attemptId\":\"m1-a1\"}",
                "{\"stepId\":\"read-b\",\"kind\":\"READ_OBSERVED\",\"occurrence\":1,\"operationId\":\"q1\"}"))
            assertThatThrownBy(() -> mapper.readValue(json, GuidedCheckpoint.Target.class)).as(json).isInstanceOf(RuntimeException.class);
    }

    @Test void configuredMapperRejectsMissingMixedMalformedUnknownAndRepeatedAnalysisTargets() {
        for (String json : List.of(
                "null", "[]", "42", "\"q1\"",
                "{\"operationId\":null,\"kind\":\"TENANT_RANGE\",\"occurrence\":1}",
                "{\"operationId\":[],\"kind\":\"TENANT_RANGE\",\"occurrence\":1}",
                "{\"operationId\":{},\"kind\":\"TENANT_RANGE\",\"occurrence\":1}",
                "{\"kind\":\"TENANT_RANGE\",\"occurrence\":1}",
                "{\"operationId\":\"q1\",\"kind\":\"TENANT_RANGE\"}",
                "{\"operationId\":\"q1\",\"kind\":\"UNKNOWN\",\"occurrence\":1}",
                "{\"operationId\":\"q1\",\"kind\":\"TENANT_RANGE\",\"occurrence\":2}",
                "{\"operationId\":\"q1\",\"kind\":\"TENANT_RANGE\",\"occurrence\":1,\"operation\":1}",
                "{\"operationId\":\"q1\",\"kind\":\"TENANT_RANGE\",\"occurrence\":1,\"jobId\":\"job-1\"}",
                "{\"operationId\":\"q1\",\"kind\":\"TENANT_RANGE\",\"occurrence\":1,\"messageId\":\"m1\",\"attemptId\":\"m1-a1\"}",
                "{\"operationId\":\"q1\",\"kind\":\"TENANT_RANGE\",\"occurrence\":1,\"invented\":true}")) {
            if (json.equals("null")) {
                // JSON null is parsed as no target; an authored checkpoint must supply an object.
                assertThat(mapper.readValue(json, GuidedCheckpoint.Target.class)).isNull();
            } else {
                assertThatThrownBy(() -> mapper.readValue(json, GuidedCheckpoint.Target.class))
                        .as(json).isInstanceOf(RuntimeException.class);
            }
        }
    }

    @Test void atomicityStepTargetsRejectMalformedMixedAndUnsupportedWireShapes() {
        for (String json : List.of(
                "{\"stepId\":null,\"kind\":\"TRANSACTION_COMMITTED\",\"occurrence\":1}",
                "{\"stepId\":\"commit-a\",\"kind\":\"TRANSACTION_RECOVERED\",\"occurrence\":1}",
                "{\"stepId\":\"commit-a\",\"kind\":\"TRANSACTION_COMMITTED\",\"occurrence\":2}",
                "{\"stepId\":\"commit-a\",\"kind\":\"TRANSACTION_COMMITTED\"}",
                "{\"stepId\":\"commit-a\",\"kind\":\"TRANSACTION_COMMITTED\",\"occurrence\":1,\"operationId\":\"q1\"}",
                "{\"stepId\":\"commit-a\",\"kind\":\"TRANSACTION_COMMITTED\",\"occurrence\":1,\"jobId\":\"job-1\"}"))
            assertThatThrownBy(() -> mapper.readValue(json, GuidedCheckpoint.Target.class)).as(json).isInstanceOf(RuntimeException.class);
    }

}
