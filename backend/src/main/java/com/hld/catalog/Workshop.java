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
            List<String> sourceIds,
            List<Walkthrough> walkthroughs) {
        public WorkshopStage(String id, String title, String prompt, String reference,
                             List<RubricCriterion> rubric, List<ExperimentLink> experimentLinks,
                             List<String> sourceIds) {
            this(id, title, prompt, reference, rubric, experimentLinks, sourceIds, List.of());
        }

        public WorkshopStage {
            if (rubric != null) rubric = List.copyOf(rubric);
            if (experimentLinks != null) experimentLinks = List.copyOf(experimentLinks);
            if (sourceIds != null) sourceIds = List.copyOf(sourceIds);
            walkthroughs = walkthroughs == null ? List.of() : List.copyOf(walkthroughs);
        }
    }

    /** Optional authored diagrams; absent on older resources, never executable traces. */
    public record Walkthrough(String id, String title, String summary,
                              List<DiagramNode> nodes, List<DiagramStep> steps) {
        public Walkthrough {
            if (nodes != null) nodes = List.copyOf(nodes);
            if (steps != null) steps = List.copyOf(steps);
        }
    }

    public record DiagramNode(String id, String title, String detail) {
    }

    public record DiagramStep(String id, String title, String from, String to, String detail) {
    }

    public record RubricCriterion(String id, String prompt) {
    }

    public record ExperimentLink(String topicId, String label, String instruction) {
    }
}
