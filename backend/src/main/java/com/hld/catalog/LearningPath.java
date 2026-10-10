package com.hld.catalog;

import java.util.List;

/** Ordered editorial guidance, with destinations and answer identities resolved from the catalog. */
public record LearningPath(int schemaVersion, String id, String title, String summary,
                           List<Step> steps, List<CatalogEntry> optionalModules) {
    public record Step(String moduleId, String purpose, boolean available,
                       CatalogEntry entry, List<Activity> activities) { }
    public record Activity(String id, String kind, List<String> optionIds) { }
}
