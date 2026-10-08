package com.hld.catalog;

import java.util.List;

/** Authored design exercise; it describes decisions, not an executable simulator. */
public record Workshop(
        int schemaVersion,
        String id,
        String contentVersion,
        String introduction,
        String invariant,
        List<WorkshopStage> stages) {
    public Workshop {
        if (stages != null) stages = List.copyOf(stages);
    }

    public record WorkshopStage(
            String id,
            String title,
            String prompt,
            String reference,
            List<RubricCriterion> rubric,
            List<ExperimentLink> experimentLinks,
            List<String> sourceIds) {
        public WorkshopStage {
            if (rubric != null) rubric = List.copyOf(rubric);
            if (experimentLinks != null) experimentLinks = List.copyOf(experimentLinks);
            if (sourceIds != null) sourceIds = List.copyOf(sourceIds);
        }
    }

    public record RubricCriterion(String id, String prompt) {
    }

    public record ExperimentLink(String topicId, String label, String instruction) {
    }
}
