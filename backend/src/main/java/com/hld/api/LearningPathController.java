package com.hld.api;

import com.hld.catalog.LearningPath;
import com.hld.catalog.LearningPathService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/learning-paths")
public class LearningPathController {
    private final LearningPathService paths;

    public LearningPathController(LearningPathService paths) {
        this.paths = paths;
    }
    @GetMapping("/{id}")
    public LearningPath path(@PathVariable String id) {
        return paths.path(id);
    }
}
