package com.hld.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.hld.search.SearchService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class SearchApiTest {
    @Autowired MockMvc mvc;
    @Autowired SearchService search;

    @Test
    void searchesRealPackagedLessonsAndReturnsUsableStudyRoutes() throws Exception {
        mvc.perform(get("/api/v1/search").param("q", "stale reads").param("capability", "simulation"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.schemaVersion").value(1))
                .andExpect(jsonPath("$.results[0].entry.id").value("cache-aside"))
                .andExpect(jsonPath("$.results[0].path").value("/topics/cache-aside?view=study"))
                .andExpect(jsonPath("$.results[0].stageId").doesNotExist())
                .andExpect(jsonPath("$.limit").value(20));
    }

    @Test
    void excludesDraftCasesAndHasHonestBlankAndNoResultResponses() throws Exception {
        assertThat(search.search("shortener", "", "").results()).noneMatch(hit -> hit.entry().id().equals("url-shortener"));
        mvc.perform(get("/api/v1/search")).andExpect(status().isOk()).andExpect(jsonPath("$.totalMatches").value(0));
        mvc.perform(get("/api/v1/search").param("q", "no-such-concept-xyz"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.results").isEmpty()).andExpect(jsonPath("$.totalMatches").value(0));
        mvc.perform(get("/api/v1/search").param("q", "codes").param("capability", "case-study"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.results").isEmpty());
    }

    @Test
    void refusesMalformedUnknownAndRepeatedFiltersWithStructuredErrors() throws Exception {
        for (var request : new org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder[] {
                get("/api/v1/search").param("q", "x".repeat(101)),
                get("/api/v1/search").param("q", "a"),
                get("/api/v1/search").param("q", "cache").param("level", "Expert"),
                get("/api/v1/search").param("q", "cache").param("capability", "unknown"),
                get("/api/v1/search").param("q", "cache", "queue"),
                get("/api/v1/search").param("q", "cache").param("typo", "simulation") }) {
            mvc.perform(request).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("invalid_input"));
        }
    }
}
