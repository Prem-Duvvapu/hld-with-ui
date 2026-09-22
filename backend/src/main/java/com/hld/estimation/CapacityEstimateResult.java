package com.hld.estimation;

import java.util.List;

public record CapacityEstimateResult(
        String schemaVersion,
        String estimatorId,
        String status,
        CapacityMetrics metrics,
        List<CalculationStep> steps,
        List<SensitivityPoint> sensitivity,
        List<String> assumptions,
        List<String> warnings) {
}
