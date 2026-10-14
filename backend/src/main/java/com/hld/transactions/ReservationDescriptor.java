package com.hld.transactions;

import java.util.List;

/** The named unsafe baseline is the default; scenarios reuse the pure model's canonical inputs. */
public record ReservationDescriptor(
        String id,
        String title,
        String kind,
        String modelVersion,
        String description,
        ReservationLimits limits,
        List<ReservationPresets.Preset> presets,
        List<String> assumptions) {
    public ReservationDescriptor {
        presets = List.copyOf(presets);
        assumptions = List.copyOf(assumptions);
    }
}
