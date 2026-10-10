package com.hld.catalog;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

@Service
public class LearningPathService {
    public record StepDefinition(String moduleId, String purpose) { }
    public record Definition(int schemaVersion, String id, String title, String summary,
                             List<StepDefinition> steps, List<String> optionalModuleIds) { }
    private final Map<String, LearningPath> paths;

    @Autowired
    public LearningPathService(ObjectMapper mapper, CatalogService catalog) {
        this(readDefinitions(mapper), catalog);
    }

    LearningPathService(List<Definition> definitions, CatalogService catalog) {
        List<CatalogEntry> entries = catalog.entriesForLearningPaths();
        validate(definitions, entries);
        Map<String, CatalogEntry> byId = new LinkedHashMap<>();
        entries.forEach(entry -> byId.put(entry.id(), entry));
        Map<String, LearningPath> resolved = new LinkedHashMap<>();
        for (Definition definition : definitions) {
            List<LearningPath.Step> steps = definition.steps().stream().map(step -> {
                CatalogEntry entry = byId.get(step.moduleId());
                boolean available = "published".equals(entry.status());
                return new LearningPath.Step(step.moduleId(), step.purpose(), available,
                        available ? entry : null, available ? activities(entry, catalog) : List.of());
            }).toList();
            List<CatalogEntry> optional = definition.optionalModuleIds().stream()
                    .map(byId::get).filter(entry -> "published".equals(entry.status())).toList();
            resolved.put(definition.id(), new LearningPath(1, definition.id(), definition.title(),
                    definition.summary(), steps, optional));
        }
        paths = Map.copyOf(resolved);
    }

    public LearningPath path(String id) {
        LearningPath path = paths.get(id);
        if (path == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No learning path has id " + id + ".");
        }
        return path;
    }

    static void validate(List<Definition> definitions, List<CatalogEntry> catalog) {
        if (definitions == null || definitions.isEmpty() || definitions.size() > 8)
            throw new IllegalStateException("Learning paths must contain 1 to 8 definitions");
        Map<String, CatalogEntry> entries = new LinkedHashMap<>();
        catalog.forEach(entry -> entries.put(entry.id(), entry));
        Set<String> ids = new HashSet<>();
        for (Definition path : definitions) {
            if (path == null || path.schemaVersion() != 1 || !identifier(path.id()) || !ids.add(path.id())
                    || !text(path.title(), 200) || !text(path.summary(), 1000)
                    || path.steps() == null || path.steps().isEmpty() || path.steps().size() > 12
                    || path.optionalModuleIds() == null || path.optionalModuleIds().size() > 8)
                throw new IllegalStateException("Invalid or duplicate learning path definition");
            Set<String> seen = new HashSet<>();
            for (StepDefinition step : path.steps()) {
                if (step == null || !identifier(step.moduleId()) || !text(step.purpose(), 200))
                    throw new IllegalStateException(path.id() + ": invalid step");
                validateModule(path.id(), step.moduleId(), entries, seen);
            }
            for (String id : path.optionalModuleIds()) validateModule(path.id(), id, entries, seen);
        }
    }

    private static void validateModule(String path, String id, Map<String, CatalogEntry> entries, Set<String> seen) {
        CatalogEntry entry = entries.get(id);
        if (!identifier(id) || entry == null || seen.contains(id))
            throw new IllegalStateException(path + ": unknown or duplicate module " + id);
        if (!seen.containsAll(entry.prerequisites()))
            throw new IllegalStateException(path + ": prerequisites must appear before " + id);
        seen.add(id);
    }

    private static List<LearningPath.Activity> activities(CatalogEntry entry, CatalogService catalog) {
        List<LearningPath.Activity> result = new ArrayList<>();
        if ("topic".equals(entry.kind())) {
            TopicDetail detail = catalog.topic(entry.id());
            if (entry.capabilities().contains("practice")) {
                for (Question question : detail.questions()) {
                    List<String> options = question.options() == null ? List.of()
                            : question.options().stream().map(Question.Option::id).toList();
                    result.add(new LearningPath.Activity(question.id(), options.isEmpty() ? "text" : "choice", options));
                }
            }
            if (entry.capabilities().contains("guided")) {
                for (GuidedCheckpoint checkpoint : detail.checkpoints()) {
                    result.add(new LearningPath.Activity(checkpoint.id() + "-prediction", "text", List.of()));
                    result.add(new LearningPath.Activity(checkpoint.id() + "-tradeoff", "choice",
                            checkpoint.tradeoff().options().stream().map(GuidedCheckpoint.Tradeoff.Option::id).toList()));
                }
            }
        } else {
            for (Workshop.WorkshopStage stage : catalog.caseStudy(entry.id()).workshop().stages()) {
                result.add(new LearningPath.Activity(stage.id() + "-attempt", "text", List.of()));
                result.add(new LearningPath.Activity(stage.id() + "-revision", "text", List.of()));
                for (Workshop.RubricCriterion criterion : stage.rubric()) {
                    result.add(new LearningPath.Activity(stage.id() + "-check-" + criterion.id(), "choice",
                            List.of("yes", "revisit")));
                }
            }
        }
        if (result.size() > 200 || result.stream().map(LearningPath.Activity::id).distinct().count() != result.size()
                || result.stream().anyMatch(activity -> !identifier(activity.id()) || activity.optionIds().size() > 20))
            throw new IllegalStateException(entry.id() + ": invalid learning activity identities");
        return List.copyOf(result);
    }

    private static boolean identifier(String value) {
        return WorkshopValidator.identifier(value) && value.length() <= 100;
    }
    private static boolean text(String value, int maximum) {
        return value != null && !value.isBlank() && value.length() <= maximum;
    }
    private static List<Definition> readDefinitions(ObjectMapper mapper) {
        try (InputStream stream = new ClassPathResource("content/learning-paths.json").getInputStream()) {
            return mapper.readValue(stream, new TypeReference<>() { });
        } catch (IOException exception) {
            throw new IllegalStateException("Cannot read learning paths", exception);
        }
    }
}
