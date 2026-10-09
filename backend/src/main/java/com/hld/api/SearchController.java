package com.hld.api;

import com.hld.search.SearchResponse;
import com.hld.search.SearchService;
import java.util.Set;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class SearchController {
    private final SearchService search;

    public SearchController(SearchService search) {
        this.search = search;
    }

    @GetMapping("/api/v1/search")
    public SearchResponse search(@RequestParam MultiValueMap<String, String> parameters) {
        for (var entry : parameters.entrySet()) {
            if (!Set.of("q", "level", "capability").contains(entry.getKey()) || entry.getValue().size() != 1) {
                throw new IllegalArgumentException("Use one value each for q, level and capability; unknown search filters are unsupported.");
            }
        }
        return search.search(parameters.getFirst("q"), parameters.getFirst("level"), parameters.getFirst("capability"));
    }
}
