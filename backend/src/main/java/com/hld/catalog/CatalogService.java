package com.hld.catalog;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

@Service
public class CatalogService {
    private final ObjectMapper mapper;
    private final List<CatalogEntry> topics;
    private final Map<String, CaseStudyDetail> workshops;

    public CatalogService(ObjectMapper mapper) {
        this.mapper = mapper;
        this.topics = readJson("content/catalog.json", new TypeReference<>() {});
        validateCatalog(topics);
        Map<String, CaseStudyDetail> loaded = new LinkedHashMap<>();
        for (CatalogEntry entry : topics) {
            if (!"case-study".equals(entry.kind()) || "planned".equals(entry.status())) continue;
            String expectedPath = "case-studies/" + entry.id() + "/workshop.json";
            if (!expectedPath.equals(entry.workshopPath())
                    || !entry.capabilities().contains("case-study")) {
                throw new IllegalStateException("Workshop resource path or capability is invalid");
            }
            Workshop workshop = readJson("content/" + expectedPath, new TypeReference<>() {});
            WorkshopValidator.validate(entry, workshop, topics);
            loaded.put(entry.id(), new CaseStudyDetail(entry, workshop));
        }
        this.workshops = Map.copyOf(loaded);
    }

    List<CatalogEntry> entriesForLearningPaths() {
        return topics;
    }

    public List<CatalogEntry> publishedTopics() {
        return topics.stream()
                .filter(topic -> "topic".equals(topic.kind()) && "published".equals(topic.status()))
                .sorted(Comparator.comparingInt(CatalogEntry::order))
                .toList();
    }

    public List<CatalogEntry> publishedCaseStudies() {
        return workshops.values().stream()
                .map(CaseStudyDetail::entry)
                .filter(entry -> "published".equals(entry.status()))
                .sorted(Comparator.comparingInt(CatalogEntry::order).thenComparing(CatalogEntry::id))
                .toList();
    }

    public TopicDetail topic(String id) {
        CatalogEntry entry = topics.stream()
                .filter(topic -> topic.id().equals(id) && "topic".equals(topic.kind()) && "published".equals(topic.status()))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No published topic has id " + id + "."));
        String lesson = readText("content/" + entry.lessonPath());
        List<Question> questions = readJson("content/" + entry.questionsPath(), new TypeReference<>() {});
        List<GuidedCheckpoint> checkpoints = entry.checkpointsPath() == null
                ? List.of()
                : readJson("content/" + entry.checkpointsPath(), new TypeReference<>() {});
        return new TopicDetail(entry, lesson, questions, checkpoints);
    }

    public CaseStudyDetail caseStudy(String id) {
        CaseStudyDetail detail = workshops.get(id);
        if (detail == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No available case study has id " + id + ".");
        }
        return detail;
    }

    private void validateCatalog(List<CatalogEntry> entries) {
        if (entries == null || entries.stream().anyMatch(java.util.Objects::isNull)) {
            throw new IllegalStateException("Catalog entries must be present");
        }
        long distinct = entries.stream().map(CatalogEntry::id).distinct().count();
        if (distinct != entries.size()) {
            throw new IllegalStateException("Catalog IDs must be unique");
        }
        entries.forEach(entry -> {
            if (!WorkshopValidator.identifier(entry.id()) || entry.capabilities() == null
                    || !("topic".equals(entry.kind()) || "case-study".equals(entry.kind()))
                    || !("planned".equals(entry.status()) || "draft".equals(entry.status()) || "published".equals(entry.status()))) {
                throw new IllegalStateException("Catalog entry is incomplete");
            }
        });
        Map<String, CatalogEntry> byId = new LinkedHashMap<>();
        entries.forEach(entry -> byId.put(entry.id(), entry));
        for (CatalogEntry entry : entries) {
            if (entry.prerequisites() == null) {
                throw new IllegalStateException(entry.id() + ": prerequisites must be an array");
            }
            Set<String> seen = new HashSet<>();
            for (String id : entry.prerequisites()) {
                if (!WorkshopValidator.identifier(id) || !seen.add(id)) {
                    throw new IllegalStateException(entry.id() + ": invalid or duplicate prerequisite ID");
                }
                if (entry.id().equals(id)) {
                    throw new IllegalStateException(entry.id() + ": cannot require itself");
                }
                CatalogEntry prerequisite = byId.get(id);
                if (prerequisite == null) {
                    throw new IllegalStateException(entry.id() + ": unknown prerequisite " + id);
                }
                if ("published".equals(entry.status()) && !"published".equals(prerequisite.status())) {
                    throw new IllegalStateException(entry.id() + ": published entry requires unpublished " + id);
                }
            }
        }
        Set<String> visited = new HashSet<>();
        Set<String> active = new HashSet<>();
        for (String id : byId.keySet()) visitPrerequisites(id, byId, visited, active);
    }

    private static void visitPrerequisites(String id, Map<String, CatalogEntry> entries,
            Set<String> visited, Set<String> active) {
        if (active.contains(id)) {
            throw new IllegalStateException(id + ": prerequisite cycle");
        }
        if (!visited.add(id)) return;
        active.add(id);
        for (String prerequisite : entries.get(id).prerequisites()) {
            visitPrerequisites(prerequisite, entries, visited, active);
        }
        active.remove(id);
    }

    private <T> T readJson(String path, TypeReference<T> type) {
        try (InputStream stream = new ClassPathResource(path).getInputStream()) {
            return mapper.readValue(stream, type);
        } catch (IOException exception) {
            throw new IllegalStateException("Cannot read " + path, exception);
        }
    }

    private String readText(String path) {
        try (InputStream stream = new ClassPathResource(path).getInputStream()) {
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException exception) {
            throw new IllegalStateException("Cannot read " + path, exception);
        }
    }
}
