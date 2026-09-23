package com.hld.simulation;

import java.util.List;

public record SimulationDescriptor(
        String id,
        String title,
        String kind,
        String modelVersion,
        String description,
        SimulationLimits limits,
        List<SimulationPreset> presets,
        List<String> assumptions) {
    public record SimulationPreset(String id, String title, String question, RequestFlowInput input) {}
}
