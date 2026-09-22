package com.hld.simulation;

import java.util.List;
import java.util.Map;

public record SimulationDescriptor(
        String id,
        String title,
        String kind,
        String modelVersion,
        String description,
        Map<String, Object> limits,
        List<SimulationPreset> presets,
        List<String> assumptions) {
    public record SimulationPreset(String id, String title, String question, RequestFlowInput input) {}
}
