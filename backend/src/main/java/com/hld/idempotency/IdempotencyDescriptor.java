package com.hld.idempotency;

import java.util.List;

/** Model metadata and original scenarios; no independent executable scenario registry. */
public record IdempotencyDescriptor(String id, String title, String kind, String schemaVersion,
        String modelVersion, String description, String defaultPresetId, IdempotencyLimits limits,
        List<IdempotencyPresets.Preset> presets, List<String> assumptions) {
    public IdempotencyDescriptor {
        presets = List.copyOf(presets);
        assumptions = List.copyOf(assumptions);
    }
}
