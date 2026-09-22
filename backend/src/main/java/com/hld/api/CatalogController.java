package com.hld.api;

import com.hld.catalog.CatalogEntry;
import com.hld.catalog.CatalogService;
import com.hld.catalog.TopicDetail;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/topics")
public class CatalogController {
    private final CatalogService catalog;

    public CatalogController(CatalogService catalog) {
        this.catalog = catalog;
    }

    @GetMapping
    public List<CatalogEntry> topics() {
        return catalog.publishedTopics();
    }

    @GetMapping("/{id}")
    public TopicDetail topic(@PathVariable String id) {
        return catalog.topic(id);
    }
}
