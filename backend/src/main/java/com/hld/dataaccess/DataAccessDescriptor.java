package com.hld.dataaccess;

import java.util.List;

public record DataAccessDescriptor(String id, String title, String kind, String modelVersion,
        String description, DataAccessLimits limits, List<Preset> presets, List<String> assumptions) {
    public DataAccessDescriptor { presets = List.copyOf(presets); assumptions = List.copyOf(assumptions); }
    public record Preset(String id, String title, String question, DataAccessInput input) {}
}
