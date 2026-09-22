package com.hld.estimation;

import java.util.List;
import java.util.Map;

public record CapacityEstimatorDescriptor(
        String id,
        String title,
        String kind,
        String schemaVersion,
        String description,
        CapacityEstimateInput defaultInput,
        List<Preset> presets,
        Map<String, Object> limits,
        List<String> assumptions) {
    public record Preset(String id, String title, String question, CapacityEstimateInput input) {
    }
}
