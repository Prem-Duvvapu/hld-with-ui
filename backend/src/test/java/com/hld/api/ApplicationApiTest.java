package com.hld.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class ApplicationApiTest {
    @Autowired MockMvc mvc;

    @Test
    void exposesThePublishedTopicAndHealth() throws Exception {
        mvc.perform(get("/api/v1/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ready"));
        mvc.perform(get("/api/v1/topics"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value("request-flow"))
                .andExpect(jsonPath("$[0].simulationIds[0]").value("request-flow"))
                .andExpect(jsonPath("$[0].sourceIds.length()").value(2));
        mvc.perform(get("/api/v1/topics/request-flow"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.questions.length()").value(3))
                .andExpect(jsonPath("$.questions[0].topicId").value("request-flow"))
                .andExpect(jsonPath("$.questions[2].options").doesNotExist());
    }

    @Test
    void runsTheBaselineThroughTheHttpContract() throws Exception {
        mvc.perform(post("/api/v1/simulations/request-flow/runs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"schemaVersion":"1.0","modelVersion":"1.0.0",
                                "policy":"ROUND_ROBIN","arrivalTimesMs":[0,0,0,0,0,0],
                                "nodeServiceTimesMs":[100,100],"workersPerNode":1,
                                "queueCapacity":10,"seed":7}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("completed"))
                .andExpect(jsonPath("$.truncationReason").doesNotExist())
                .andExpect(jsonPath("$.lastVirtualTimeMs").value(300))
                .andExpect(jsonPath("$.incompleteRequests").value(0))
                .andExpect(jsonPath("$.limits.maxEvents").value(10_000))
                .andExpect(jsonPath("$.metrics.completed").value(6))
                .andExpect(jsonPath("$.metrics.meanLatencyMs").value(200.0))
                .andExpect(jsonPath("$.outcomes[4].queueMs").value(200));
    }

    @Test
    void rejectsUnknownFieldsAndInvalidValues() throws Exception {
        mvc.perform(post("/api/v1/simulations/request-flow/runs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"schemaVersion":"1.0","modelVersion":"1.0.0",
                                "policy":"ROUND_ROBIN","arrivalTimesMs":[0],
                                "nodeServiceTimesMs":[100],"workersPerNode":0,
                                "queueCapacity":10,"seed":7,"surprise":true}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("invalid_input"));
    }

    @Test
    void exposesAndCalculatesTheCapacityEstimate() throws Exception {
        mvc.perform(get("/api/v1/estimators/capacity-estimation"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.defaultInput.dailyActiveUsers").value(1_000_000))
                .andExpect(jsonPath("$.presets.length()").value(3));

        mvc.perform(post("/api/v1/estimators/capacity-estimation/calculations")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"schemaVersion":"1.0","dailyActiveUsers":1000000,
                                "requestsPerUserPerDay":10,"peakFactor":5,"readPercentage":90,
                                "recordSizeKb":1,"responseSizeKb":2,"retentionDays":365,
                                "replicationFactor":3,"meanLatencyMs":200,"headroomPercentage":30}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.metrics.rawStorageGigabytes").value(365))
                .andExpect(jsonPath("$.metrics.replicatedStorageGigabytes").value(1095))
                .andExpect(jsonPath("$.metrics.meanConcurrentRequests").value(115.74074074074075));
    }
}
