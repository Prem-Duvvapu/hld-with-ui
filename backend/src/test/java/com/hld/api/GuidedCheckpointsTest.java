package com.hld.api;

import static org.assertj.core.api.Assertions.assertThat;

import com.hld.cache.CacheAsideDescriptor.CacheAsidePreset;
import com.hld.cache.CacheAsideResult;
import com.hld.cache.CacheAsideTraceEvent;
import com.hld.catalog.CatalogService;
import com.hld.catalog.GuidedCheckpoint;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * Every published checkpoint must point at a real event in its preset's Java trace, and the
 * numbers its explanation teaches must be the numbers that event carries.
 */
@SpringBootTest
class GuidedCheckpointsTest {
    @Autowired CatalogService catalog;
    @Autowired CacheAsideController cache;

    record Resolved(CacheAsideResult result, CacheAsideTraceEvent event) {}

    private Resolved resolve(GuidedCheckpoint checkpoint) {
        CacheAsidePreset preset = cache.descriptor().presets().stream()
                .filter(candidate -> candidate.id().equals(checkpoint.presetId()))
                .findFirst()
                .orElseThrow(() -> new AssertionError(checkpoint.id() + ": unknown preset " + checkpoint.presetId()));
        CacheAsideResult result = cache.run(preset.input());
        assertThat(result.status()).as(checkpoint.id() + " runs to completion").isEqualTo("completed");
        GuidedCheckpoint.Target target = checkpoint.target();
        List<CacheAsideTraceEvent> matches = result.events().stream()
                .filter(event -> event.operation() == target.operation() && event.kind().equals(target.kind()))
                .toList();
        assertThat(matches).as(checkpoint.id() + " target").hasSizeGreaterThanOrEqualTo(target.occurrence());
        return new Resolved(result, matches.get(target.occurrence() - 1));
    }

    private final Map<String, Consumer<Resolved>> taughtFacts = Map.of(
            "cold-miss-fill", r -> {
                assertThat(r.event().timeMs()).isEqualTo(22);
                assertThat(r.event().cacheEntry().expiresAtMs()).isEqualTo(122);
                assertThat(r.result().outcomes().get(0).latencyMs()).isEqualTo(22);
            },
            "warm-hit", r -> {
                assertThat(r.event().timeMs()).isEqualTo(32);
                assertThat(r.result().outcomes().get(1).latencyMs()).isEqualTo(2);
            },
            "update-keeps-cache", r -> {
                assertThat(r.event().timeMs()).isEqualTo(40);
                assertThat(r.event().originValue().version()).isEqualTo(2);
                assertThat(r.event().cacheEntry().version()).isEqualTo(1);
            },
            "stale-hit", r -> {
                assertThat(r.event().timeMs()).isEqualTo(72);
                assertThat(r.event().cacheEntry().value()).isEqualTo("v1");
                assertThat(r.event().originValue().value()).isEqualTo("v2");
                assertThat(r.result().outcomes().get(2).stale()).isTrue();
            },
            "expiry-miss", r -> {
                assertThat(r.event().timeMs()).isEqualTo(122);
                assertThat(r.event().cacheEntry().expiresAtMs()).isEqualTo(122);
                assertThat(r.result().outcomes().get(3).returnedValue()).isEqualTo("v2");
            },
            "cold-burst", r -> {
                assertThat(r.event().timeMs()).isEqualTo(26);
                assertThat(r.result().metrics().cacheMisses()).isEqualTo(5);
                assertThat(r.result().metrics().originReads()).isEqualTo(5);
            },
            "cache-bypass", r -> {
                assertThat(r.event().timeMs()).isEqualTo(80);
                assertThat(r.result().metrics().cacheBypasses()).isEqualTo(3);
                assertThat(r.result().metrics().originReads()).isEqualTo(3);
                assertThat(r.result().events()).allMatch(event -> event.cacheEntry() == null);
            },
            "origin-failure", r -> {
                assertThat(r.event().timeMs()).isEqualTo(2);
                assertThat(r.result().metrics().failedGets()).isEqualTo(2);
                assertThat(r.result().events()).allMatch(event -> event.cacheEntry() == null);
            });

    @Test
    void everyCacheCheckpointResolvesToTheEventItsExplanationDescribes() {
        List<GuidedCheckpoint> checkpoints = catalog.topic("cache-aside").checkpoints();
        assertThat(checkpoints).extracting(GuidedCheckpoint::id)
                .containsExactlyInAnyOrderElementsOf(taughtFacts.keySet());
        for (GuidedCheckpoint checkpoint : checkpoints) {
            assertThat(checkpoint.simulationId()).isEqualTo("cache-aside");
            taughtFacts.get(checkpoint.id()).accept(resolve(checkpoint));
        }
    }

    @Test
    void checkpointsCoverEveryCachePreset() {
        assertThat(catalog.topic("cache-aside").checkpoints().stream()
                        .map(GuidedCheckpoint::presetId)
                        .collect(Collectors.toSet()))
                .containsExactlyInAnyOrderElementsOf(cache.descriptor().presets().stream()
                        .map(CacheAsidePreset::id)
                        .toList());
    }

    @Test
    void topicsWithoutTheGuidedCapabilityHaveNoCheckpoints() {
        for (var entry : catalog.publishedTopics()) {
            boolean guided = entry.capabilities().contains("guided");
            assertThat(catalog.topic(entry.id()).checkpoints().isEmpty())
                    .as(entry.id())
                    .isNotEqualTo(guided);
        }
    }
}
