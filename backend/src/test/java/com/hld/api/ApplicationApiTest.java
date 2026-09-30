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
        mvc.perform(get("/api/v1/simulations/request-flow"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.limits.maxRequests").value(100))
                .andExpect(jsonPath("$.limits.maxArrivalTimeMs").value(60_000))
                .andExpect(jsonPath("$.limits.maxServiceTimeMs").value(10_000))
                .andExpect(jsonPath("$.presets.length()").value(4));
    }

    @Test
    void reportsUnknownRoutesAsNotFound() throws Exception {
        for (String path : new String[] {"/", "/api/v1/nope", "/api/v1/topics/request-flow/extra"}) {
            mvc.perform(get(path))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.code").value("not_found"));
        }
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
    void exposesAndRunsTheDistributedRateLimiter() throws Exception {
        mvc.perform(get("/api/v1/simulations/distributed-rate-limiter"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.presets.length()").value(3))
                .andExpect(jsonPath("$.presets[1].id").value("local-overshoot"));

        mvc.perform(post("/api/v1/simulations/distributed-rate-limiter/runs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"schemaVersion":"1.0","modelVersion":"1.0.0",
                                "algorithm":"FIXED_WINDOW","counterScope":"SHARED",
                                "nodeCount":3,"limit":2,"windowMs":1000,
                                "refillTokensPerSecond":2,"counterBackendAvailable":true,
                                "backendFailurePolicy":"FAIL_CLOSED",
                                "arrivalTimesMs":[0,0,0],"seed":42}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.metrics.allowed").value(2))
                .andExpect(jsonPath("$.metrics.rejected").value(1))
                .andExpect(jsonPath("$.outcomes[2].retryAfterMs").value(1000));
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

    @Test
    void exposesAndRunsTheCacheAsideSimulator() throws Exception {
        mvc.perform(get("/api/v1/simulations/cache-aside"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value("cache-aside"))
                .andExpect(jsonPath("$.presets.length()").value(4))
                .andExpect(jsonPath("$.presets[0].id").value("baseline"));

        mvc.perform(post("/api/v1/simulations/cache-aside/runs")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "schemaVersion": "1.0",
                                  "modelVersion": "1.0.1",
                                  "cacheLookupLatencyMs": 2,
                                  "originReadLatencyMs": 20,
                                  "ttlMs": 100,
                                  "initialOriginValue": "v1",
                                  "operations": [
                                    {"kind": "GET", "key": "k", "timeMs": 0},
                                    {"kind": "GET", "key": "k", "timeMs": 30},
                                    {"kind": "UPDATE", "key": "k", "value": "v2", "timeMs": 40},
                                    {"kind": "GET", "key": "k", "timeMs": 70},
                                    {"kind": "GET", "key": "k", "timeMs": 120}
                                  ],
                                  "cacheAvailable": true,
                                  "originAvailable": true,
                                  "seed": 7
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("completed"))
                .andExpect(jsonPath("$.metrics.totalGets").value(4))
                .andExpect(jsonPath("$.metrics.cacheHits").value(2))
                .andExpect(jsonPath("$.metrics.cacheMisses").value(2))
                .andExpect(jsonPath("$.metrics.staleReads").value(1))
                .andExpect(jsonPath("$.metrics.hitRatio").value(0.5))
                .andExpect(jsonPath("$.outcomes[2].stale").value(true))
                .andExpect(jsonPath("$.outcomes[2].returnedValue").value("v1"));
    }

    @Test
    void publishesTheCacheLimitsItEnforces() throws Exception {
        mvc.perform(get("/api/v1/simulations/cache-aside"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.limits.maxLatencyMs").value(10_000))
                .andExpect(jsonPath("$.limits.maxTtlMs").value(60_000))
                .andExpect(jsonPath("$.limits.maxOperations").value(100))
                .andExpect(jsonPath("$.limits.maxOperationTimeMs").value(60_000))
                .andExpect(jsonPath("$.limits.maxKeyLength").value(64))
                .andExpect(jsonPath("$.limits.maxValueLength").value(256));

        String atLimit = cacheRun(60_000, "k".repeat(64));
        mvc.perform(post("/api/v1/simulations/cache-aside/runs")
                        .contentType(MediaType.APPLICATION_JSON).content(atLimit))
                .andExpect(status().isOk());
        for (String beyond : new String[] {cacheRun(60_001, "k"), cacheRun(100, "k".repeat(65))}) {
            mvc.perform(post("/api/v1/simulations/cache-aside/runs")
                            .contentType(MediaType.APPLICATION_JSON).content(beyond))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("invalid_input"));
        }
    }

    private static String cacheRun(long ttlMs, String key) {
        return """
                {"schemaVersion": "1.0", "modelVersion": "1.0.1",
                 "cacheLookupLatencyMs": 2, "originReadLatencyMs": 20, "ttlMs": %d,
                 "initialOriginValue": "v1",
                 "operations": [{"kind": "GET", "key": "%s", "timeMs": 0}],
                 "cacheAvailable": true, "originAvailable": true, "seed": 7}
                """.formatted(ttlMs, key);
    }

    @Test
    void rejectsMalformedCacheSchedulesAndRetiredModelVersions() throws Exception {
        String template = """
                {"schemaVersion":"1.0","modelVersion":"1.0.1","cacheLookupLatencyMs":2,
                 "originReadLatencyMs":20,"ttlMs":100,"initialOriginValue":"v1",
                 "operations":%s,"cacheAvailable":true,"originAvailable":true,"seed":7}
                """;
        for (String operations : new String[] {
                "[{\"kind\":\"GET\",\"key\":null,\"timeMs\":0}]",
                "[{\"kind\":\"GET\",\"key\":\"k\",\"timeMs\":9223372036854775807}]",
                "[{\"kind\":\"GET\",\"key\":\"k\"}]", "[null]"}) {
            mvc.perform(post("/api/v1/simulations/cache-aside/runs")
                            .contentType(MediaType.APPLICATION_JSON).content(template.formatted(operations)))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("invalid_input"));
        }
        String valid = template.formatted("[{\"kind\":\"GET\",\"key\":\"k\",\"timeMs\":0}]");
        for (String invalid : new String[] {valid.replace("1.0.1", "1.0.0"),
                valid.replace("\"cacheAvailable\":true,", "")}) {
            mvc.perform(post("/api/v1/simulations/cache-aside/runs")
                            .contentType(MediaType.APPLICATION_JSON).content(invalid))
                    .andExpect(status().isBadRequest());
        }
    }
}
