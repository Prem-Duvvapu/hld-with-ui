package com.hld.catalog;

import java.util.List;

public record Question(
        String id,
        String topicId,
        String level,
        String kind,
        String prompt,
        List<Option> options,
        String correctOptionId,
        String explanation,
        String followUp,
        List<String> rubric,
        String modelAnswer,
        List<String> sourceIds) {
    public record Option(String id, String label, String distractorExplanation) {
    }
}
