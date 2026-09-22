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
}
