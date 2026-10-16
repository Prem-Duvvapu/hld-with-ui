package com.hld.retries;

import java.util.List;

/** Canonical model presets remain the single source of runnable scenarios. */
public record RetryDescriptor(String id, String title, String kind, String modelVersion,
        String description, RetryLimits limits, List<RetryPresets.Preset> presets,
        List<String> assumptions) {
    public RetryDescriptor {
        presets = List.copyOf(presets);
        assumptions = List.copyOf(assumptions);
    }
}
