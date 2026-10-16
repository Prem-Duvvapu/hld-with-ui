package com.hld.atomicity;

import java.util.List;

/** The named baseline is the default; inputs come from the canonical model presets. */
public record AtomicityDescriptor(String id, String title, String kind, String modelVersion,
        String description, AtomicityLimits limits, List<AtomicityPresets.Preset> presets,
        List<String> assumptions) {
    public AtomicityDescriptor {
        presets = List.copyOf(presets);
        assumptions = List.copyOf(assumptions);
    }
}
