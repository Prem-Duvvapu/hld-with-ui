package com.hld.ratelimit;

import java.util.List;
import java.util.Map;

public record RateLimiterDescriptor(
        String id,
        String title,
        String kind,
        String modelVersion,
        String description,
        Map<String, Long> limits,
        List<Preset> presets,
        List<String> assumptions) {
    public record Preset(String id, String title, String question, RateLimiterInput input) {}
}
