package com.hld.queues;

import java.util.List;

/** One implemented illustrative model; its learning topic can remain an unpublished draft. */
public record QueueCapacityDescriptor(String id, String title, String kind, String modelVersion,
                                       String description, QueueCapacityLimits limits,
                                       List<Preset> presets, List<String> assumptions) {
    public QueueCapacityDescriptor {
        presets = List.copyOf(presets);
        assumptions = List.copyOf(assumptions);
    }

    public record Preset(String id, String title, String question, QueueCapacityInput input) {}
}
