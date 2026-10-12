package com.hld.delivery;

import java.util.List;

/** API metadata describes the registered model without changing its delivery semantics. */
public record DeliveryDescriptor(
        String id,
        String title,
        String kind,
        String modelVersion,
        String description,
        DeliveryLimits limits,
        List<Preset> presets,
        List<String> assumptions) {
    public DeliveryDescriptor {
        presets = List.copyOf(presets);
        assumptions = List.copyOf(assumptions);
    }

    public record Preset(String id, String title, String question, DeliveryInput input) {}
}
