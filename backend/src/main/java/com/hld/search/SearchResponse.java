package com.hld.search;

import java.util.List;

public record SearchResponse(int schemaVersion, String query, List<SearchHit> results, int totalMatches, int limit) {
    public SearchResponse {
        results = List.copyOf(results);
    }
}
