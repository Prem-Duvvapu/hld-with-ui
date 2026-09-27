package com.hld.cache;

import java.util.List;

/**
 * Describes the cache-aside simulation model, its presets, and assumptions.
 * Exposed via the descriptor endpoint so the frontend knows what inputs
 * to offer and what limits to validate.
 */
public record CacheAsideDescriptor(
        String id,
        String title,
        String kind,
        String modelVersion,
        String description,
        List<CacheAsidePreset> presets,
        List<String> assumptions) {

    public record CacheAsidePreset(
            String id,
            String title,
            String question,
            CacheAsideInput input) {
    }
}
