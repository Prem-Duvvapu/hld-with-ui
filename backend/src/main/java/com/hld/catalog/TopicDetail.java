package com.hld.catalog;

import java.util.List;

public record TopicDetail(CatalogEntry topic, String lessonMarkdown, List<Question> questions) {
}
