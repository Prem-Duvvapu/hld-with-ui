package com.hld.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class LearningPathApiTest {
    @Autowired MockMvc mvc;
    @Test void servesThePackagedPathWithOnlyPublishedDestinations() throws Exception {
        mvc.perform(get("/api/v1/learning-paths/first-system-design"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.schemaVersion").value(1))
                .andExpect(jsonPath("$.steps.length()").value(4))
                .andExpect(jsonPath("$.steps[0].entry.id").value("request-flow"))
                .andExpect(jsonPath("$.steps[1].entry.id").value("capacity-estimation"))
                .andExpect(jsonPath("$.steps[2].entry.id").value("cache-aside"))
                .andExpect(jsonPath("$.steps[2].activities").isNotEmpty())
                .andExpect(jsonPath("$.steps[3].moduleId").value("url-shortener"))
                .andExpect(jsonPath("$.steps[3].available").value(false))
                .andExpect(jsonPath("$.steps[3].entry").doesNotExist())
                .andExpect(jsonPath("$.steps[3].activities").isEmpty())
                .andExpect(jsonPath("$.optionalModules[0].id").value("distributed-rate-limiter"));
    }
    @Test void unknownAndResourceLikePathIdsReturnStructuredNotFound() throws Exception {
        for (String id : new String[] {"unknown", "catalog.json", "request-flow"})
            mvc.perform(get("/api/v1/learning-paths/" + id)).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("not_found"));
    }
}
