package com.hld.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.hld.catalog.CatalogService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class CaseStudyApiTest {
    @Autowired MockMvc mvc;
    @Autowired CatalogService catalog;

    @Test
    void deliversThreeDraftStagesWithoutClaimingPublicationOrExecution() throws Exception {
        mvc.perform(get("/api/v1/case-studies/url-shortener"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.entry.id").value("url-shortener"))
                .andExpect(jsonPath("$.entry.kind").value("case-study"))
                .andExpect(jsonPath("$.entry.status").value("draft"))
                .andExpect(jsonPath("$.entry.capabilities[0]").value("case-study"))
                .andExpect(jsonPath("$.workshop.schemaVersion").value(1))
                .andExpect(jsonPath("$.workshop.id").value("url-shortener"))
                .andExpect(jsonPath("$.workshop.contentVersion").value("1.1.0"))
                .andExpect(jsonPath("$.workshop.stages.length()").value(3))
                .andExpect(jsonPath("$.workshop.stages[0].id").value("requirements"))
                .andExpect(jsonPath("$.workshop.stages[1].id").value("estimates"))
                .andExpect(jsonPath("$.workshop.stages[2].id").value("api"))
                .andExpect(jsonPath("$.workshop.stages[0].rubric").isNotEmpty())
                .andExpect(jsonPath("$.workshop.stages[0].experimentLinks").isNotEmpty());
        var detail = catalog.caseStudy("url-shortener");
        assertThat(detail.workshop().contentVersion()).isEqualTo(detail.entry().contentVersion());
        assertThat(detail.workshop().stages().get(0).experimentLinks()).allSatisfy(link ->
                assertThat(catalog.topic(link.topicId()).topic().status()).isEqualTo("published"));
    }

    @Test
    void excludesTheWorkshopFromPublishedTopicDiscoveryAndTopicDetail() throws Exception {
        mvc.perform(get("/api/v1/topics"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(4));
        assertThat(catalog.publishedTopics()).allSatisfy(entry -> {
            assertThat(entry.kind()).isEqualTo("topic");
            assertThat(entry.status()).isEqualTo("published");
            assertThat(entry.id()).isNotEqualTo("url-shortener");
        });
        mvc.perform(get("/api/v1/topics/url-shortener"))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("not_found"));
    }

    @Test
    void rejectsUnknownTopicAndResourceLikeIdsWithStructuredNotFound() throws Exception {
        for (String id : new String[] {"unknown", "request-flow", "catalog.json", "workshop.json"}) {
            mvc.perform(get("/api/v1/case-studies/" + id))
                    .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("not_found"));
        }
        mvc.perform(get("/api/v1/case-studies/url-shortener/extra"))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("not_found"));
    }
}
