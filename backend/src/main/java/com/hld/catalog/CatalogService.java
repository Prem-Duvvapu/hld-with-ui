package com.hld.catalog;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Comparator;
import java.util.List;
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

    public CatalogService(ObjectMapper mapper) {
        this.mapper = mapper;
        this.topics = readJson("content/catalog.json", new TypeReference<>() {});
        validateCatalog(topics);
    }

    public List<CatalogEntry> publishedTopics() {
        return topics.stream()
                .filter(topic -> "published".equals(topic.status()))
                .sorted(Comparator.comparingInt(CatalogEntry::order))
                .toList();
    }

    public TopicDetail topic(String id) {
        CatalogEntry entry = topics.stream()
                .filter(topic -> topic.id().equals(id) && "published".equals(topic.status()))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No published topic has id " + id + "."));
        String lesson = readText("content/" + entry.lessonPath());
        List<Question> questions = readJson("content/" + entry.questionsPath(), new TypeReference<>() {});
        return new TopicDetail(entry, lesson, questions);
    }

    private void validateCatalog(List<CatalogEntry> entries) {
        long distinct = entries.stream().map(CatalogEntry::id).distinct().count();
        if (distinct != entries.size()) {
            throw new IllegalStateException("Catalog IDs must be unique");
        }
        entries.forEach(entry -> {
            if (entry.id() == null || entry.id().isBlank() || entry.capabilities() == null) {
                throw new IllegalStateException("Catalog entry is incomplete");
            }
        });
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
