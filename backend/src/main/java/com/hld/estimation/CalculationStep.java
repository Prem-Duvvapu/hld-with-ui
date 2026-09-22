package com.hld.estimation;

public record CalculationStep(
        String id,
        String label,
        String formula,
        double value,
        String unit,
        String meaning) {
}
