package com.hld.api;

import com.hld.catalog.CaseStudyDetail;
import com.hld.catalog.CatalogService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/case-studies")
public class CaseStudyController {
    private final CatalogService catalog;

    public CaseStudyController(CatalogService catalog) {
        this.catalog = catalog;
    }

    @GetMapping("/{id}")
    public CaseStudyDetail caseStudy(@PathVariable String id) {
        return catalog.caseStudy(id);
    }
}
