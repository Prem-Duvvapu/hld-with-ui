package com.hld.api;

import com.hld.catalog.CatalogService;
import com.hld.catalog.TopicDetail;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Explicit unpublished preview; public collections, search and published topic lookup stay scoped. */
@RestController
@RequestMapping("/api/v1/draft/topics")
public class DraftTopicController {
    private final CatalogService catalog;

    public DraftTopicController(CatalogService catalog) { this.catalog = catalog; }

    @GetMapping("/{id}")
    public TopicDetail topic(@PathVariable String id) { return catalog.draftTopic(id); }
}
