package com.hld.catalog;

import java.util.List;

public record Question(
        String id,
        String kind,
        String prompt,
        List<Option> options,
        String correctOptionId,
        String explanation,
        String followUp,
        List<String> rubric,
        String modelAnswer) {
    public record Option(String id, String label) {
    }
}
