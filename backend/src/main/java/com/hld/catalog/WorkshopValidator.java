package com.hld.catalog;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.function.Function;

/** Validate packaged resources once at startup before exposing a workshop route. */
final class WorkshopValidator {
    private WorkshopValidator() {
    }

    static void validate(CatalogEntry entry, Workshop workshop, List<CatalogEntry> catalog) {
        require(workshop != null && workshop.schemaVersion() == 1, "Unsupported workshop schema");
        require(identifier(workshop.id()) && workshop.id().equals(entry.id()), "Workshop ID must match catalog");
        require(workshop.contentVersion() != null
                && workshop.contentVersion().length() <= 32
                && workshop.contentVersion().matches("\\d+\\.\\d+\\.\\d+")
                && workshop.contentVersion().equals(entry.contentVersion()), "Workshop version must match catalog");
        require(text(workshop.introduction(), 10_000) && text(workshop.invariant(), 10_000), "Workshop introduction and invariant are required");
        unique(workshop.stages(), 1, 20, Workshop.WorkshopStage::id, "workshop stages");
        if ("published".equals(entry.status())) {
            require(workshop.stages().stream().map(Workshop.WorkshopStage::id).collect(java.util.stream.Collectors.toSet())
                    .containsAll(Set.of("requirements", "estimates", "api", "data", "baseline", "flows", "evolution", "failures", "operations", "defense")),
                    "Published workshop must include every design stage");
        }
        Set<String> sourceIds = entry.sourceIds() == null ? Set.of() : new HashSet<>(entry.sourceIds());
        Set<String> activityIds = new HashSet<>();
        for (var stage : workshop.stages()) {
            require(text(stage.title(), 200) && text(stage.prompt(), 10_000)
                    && text(stage.reference(), 10_000), "Workshop stage text is invalid");
            unique(stage.rubric(), 1, 20, Workshop.RubricCriterion::id, "stage rubric");
            activity(activityIds, stage.id() + "-attempt");
            activity(activityIds, stage.id() + "-revision");
            stage.rubric().forEach(criterion -> activity(activityIds, stage.id() + "-check-" + criterion.id()));
            stage.rubric().forEach(criterion -> require(text(criterion.prompt(), 2_000), "Rubric prompt is invalid"));
            unique(stage.walkthroughs(), 0, 4, Workshop.Walkthrough::id, "stage walkthroughs");
            for (var diagram : stage.walkthroughs()) {
                require(text(diagram.title(), 200) && text(diagram.summary(), 2_000), "Walkthrough text is invalid");
                unique(diagram.nodes(), 1, 8, Workshop.DiagramNode::id, "walkthrough nodes");
                unique(diagram.steps(), 1, 20, Workshop.DiagramStep::id, "walkthrough steps");
                Set<String> nodeIds = new HashSet<>();
                for (var node : diagram.nodes()) {
                    require(text(node.title(), 200) && text(node.detail(), 2_000), "Node text is invalid");
                    nodeIds.add(node.id());
                }
                for (var step : diagram.steps()) {
                    require(text(step.title(), 200) && text(step.detail(), 2_000), "Step text is invalid");
                    require(nodeIds.contains(step.from()) && nodeIds.contains(step.to()), "Walkthrough step has unknown node");
                }
            }
            unique(stage.sourceIds(), 1, 20, Function.identity(), "stage sources");
            require(sourceIds.containsAll(stage.sourceIds()), "Workshop source is missing from catalog");
            unique(stage.experimentLinks(), 0, 10, Workshop.ExperimentLink::topicId, "experiment links");
            for (var link : stage.experimentLinks()) {
                require(text(link.label(), 200) && text(link.instruction(), 2_000), "Experiment link text is invalid");
                require(catalog.stream().anyMatch(topic -> topic.id().equals(link.topicId())
                        && "topic".equals(topic.kind()) && "published".equals(topic.status())
                        && (topic.capabilities().contains("simulation") || topic.capabilities().contains("estimator"))),
                        "Experiment link must reference a published simulation or estimator topic");
            }
        }
    }

    static boolean identifier(String value) {
        return value != null && value.length() <= 100 && value.matches("[a-z0-9]+(?:-[a-z0-9]+)*");
    }

    private static void activity(Set<String> seen, String id) {
        require(identifier(id) && seen.add(id), "Invalid or duplicate derived activity ID");
    }

    private static boolean text(String value, int max) {
        return value != null && !value.isBlank() && value.length() <= max;
    }

    private static <T> void unique(List<T> values, int min, int max, Function<T, String> key, String label) {
        require(values != null && values.size() >= min && values.size() <= max, "Invalid " + label + " count");
        Set<String> seen = new HashSet<>();
        for (T value : values) {
            require(value != null && identifier(key.apply(value)) && seen.add(key.apply(value)),
                    "Invalid or duplicate " + label + " ID");
        }
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new IllegalStateException(message);
    }
}
