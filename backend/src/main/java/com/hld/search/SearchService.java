package com.hld.search;

import com.hld.catalog.CatalogEntry;
import com.hld.catalog.CatalogService;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.springframework.stereotype.Service;

/** Small immutable index of packaged public content; no learner answers or network access. */
@Service
public class SearchService {
    public static final int MAX_QUERY_LENGTH = 100;
    public static final int RESULT_LIMIT = 20;
    private static final Set<String> LEVELS = Set.of("Beginner", "Intermediate", "Advanced");
    private static final Set<String> CAPABILITIES = Set.of("study", "simulation", "estimator", "case-study", "practice", "guided");
    private final List<Document> documents;

    public SearchService(CatalogService catalog) {
        List<Document> loaded = new ArrayList<>();
        for (CatalogEntry entry : catalog.publishedTopics()) {
            loaded.add(new Document(entry, null, null, "/topics/" + entry.id() + "?view=study",
                    plain(catalog.topic(entry.id()).lessonMarkdown())));
        }
        for (CatalogEntry entry : catalog.publishedCaseStudies()) {
            var workshop = catalog.caseStudy(entry.id()).workshop();
            for (var stage : workshop.stages()) {
                StringBuilder body = new StringBuilder(workshop.introduction()).append(' ').append(workshop.invariant())
                        .append(' ').append(stage.prompt()).append(' ').append(stage.reference());
                stage.rubric().forEach(criterion -> body.append(' ').append(criterion.prompt()));
                for (var walkthrough : stage.walkthroughs()) {
                    body.append(' ').append(walkthrough.title()).append(' ').append(walkthrough.summary());
                    walkthrough.nodes().forEach(node -> body.append(' ').append(node.title()).append(' ').append(node.detail()));
                    walkthrough.steps().forEach(step -> body.append(' ').append(step.title()).append(' ').append(step.detail()));
                }
                loaded.add(new Document(entry, stage.id(), stage.title(),
                        "/case-studies/" + entry.id() + "?stage=" + stage.id(), plain(body.toString())));
            }
        }
        documents = List.copyOf(loaded);
    }

    public SearchResponse search(String rawQuery, String level, String capability) {
        String raw = rawQuery == null ? "" : rawQuery;
        if (raw.length() > MAX_QUERY_LENGTH || raw.codePoints().anyMatch(cp -> Character.isISOControl(cp) && !Character.isWhitespace(cp))) {
            throw new IllegalArgumentException("Search text must contain at most 100 characters and no control characters.");
        }
        String query = raw.replaceAll("[\\p{Z}\\s]+", " ").trim();
        String folded = fold(query);
        if ((!query.isEmpty() && query.length() < 2) || folded.length() > MAX_QUERY_LENGTH) {
            throw new IllegalArgumentException("Use 2 to 100 characters for search, or clear the search text.");
        }
        if (level != null && !level.isEmpty() && !LEVELS.contains(level)) {
            throw new IllegalArgumentException("Choose Beginner, Intermediate or Advanced for level.");
        }
        if (capability != null && !capability.isEmpty() && !CAPABILITIES.contains(capability)) {
            throw new IllegalArgumentException("Choose a supported learning activity.");
        }
        if (query.isEmpty()) return new SearchResponse(1, query, List.of(), 0, RESULT_LIMIT);
        List<String> terms = List.of(folded.split(" "));
        List<Match> matches = new ArrayList<>();
        for (Document document : documents) {
            CatalogEntry entry = document.entry();
            if (level != null && !level.isEmpty() && !level.equals(entry.level())) continue;
            if (capability != null && !capability.isEmpty() && !entry.capabilities().contains(capability)) continue;
            String title = entry.title() + (document.stageTitle() == null ? "" : " " + document.stageTitle());
            String all = fold(title + " " + entry.summary() + " " + document.body());
            if (!terms.stream().allMatch(all::contains)) continue;
            int rank = containsAll(title, terms) ? 0 : containsAll(entry.summary(), terms) ? 1 : 2;
            String excerptSource = rank == 0 || rank == 1 ? plain(entry.summary()) : document.body();
            matches.add(new Match(document, rank, excerpt(excerptSource, terms)));
        }
        matches.sort(Comparator.comparingInt(Match::rank)
                .thenComparingInt(match -> match.document().entry().order())
                .thenComparing(match -> match.document().entry().id()));
        List<SearchHit> results = matches.stream().limit(RESULT_LIMIT).map(match -> {
            var document = match.document();
            return new SearchHit(document.entry(), document.stageId(), document.stageTitle(), document.path(), match.excerpt());
        }).toList();
        return new SearchResponse(1, query, results, matches.size(), RESULT_LIMIT);
    }

    private static boolean containsAll(String text, List<String> terms) {
        String folded = fold(text);
        return terms.stream().allMatch(folded::contains);
    }

    private static String fold(String text) {
        return Normalizer.normalize(text, Normalizer.Form.NFKC).toLowerCase(Locale.ROOT);
    }

    /** Plain excerpt formatting only; React renders the result as text, never as HTML. */
    private static String plain(String markdown) {
        return markdown.replaceAll("!?\\[([^\\]]+)\\]\\([^)]*\\)", "$1")
                .replaceAll("</?[A-Za-z][^>]*>", " ")
                .replaceAll("(?m)^\\s{0,3}#{1,6}\\s+", "")
                .replaceAll("\\*\\*([^*]+)\\*\\*", "$1")
                .replaceAll("(?m)^\\s*[-*>]\\s+", "")
                .replaceAll("[`|]", "")
                .replaceAll("[\\p{Z}\\s]+", " ").trim();
    }

    private static String excerpt(String text, List<String> terms) {
        String folded = fold(text);
        int match = terms.stream().mapToInt(folded::indexOf).filter(index -> index >= 0).min().orElse(0);
        int points = text.codePointCount(0, text.length());
        int center = text.codePointCount(0, Math.min(match, text.length()));
        int start = Math.max(0, center - 48);
        int end = Math.min(points, start + 220);
        String visible = text.substring(text.offsetByCodePoints(0, start), text.offsetByCodePoints(0, end));
        int firstSpace = visible.indexOf(' ');
        if (start > 0 && firstSpace >= 0 && firstSpace < 24) visible = visible.substring(firstSpace + 1);
        int lastSpace = visible.lastIndexOf(' ');
        if (end < points && lastSpace > visible.length() - 24) visible = visible.substring(0, lastSpace);
        return (start > 0 ? "…" : "") + visible.trim() + (end < points ? "…" : "");
    }

    private record Document(CatalogEntry entry, String stageId, String stageTitle, String path, String body) { }
    private record Match(Document document, int rank, String excerpt) { }
}
