package com.hld.search;

import com.hld.catalog.CatalogEntry;

public record SearchHit(CatalogEntry entry, String stageId, String stageTitle, String path, String excerpt) {
}
