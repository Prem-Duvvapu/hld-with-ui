package com.hld.catalog;

import java.util.List;

public record CatalogEntry(
        String id,
        String kind,
        String title,
        String summary,
        String category,
        String level,
        int order,
        String status,
        List<String> prerequisites,
        List<String> outcomes,
        List<String> capabilities,
        String lessonPath,
        String questionsPath,
        String resourcesPath,
        List<String> simulationIds,
        List<String> estimatorIds,
        String contentVersion,
        String reviewedAt,
        List<String> sourceIds) {
}
