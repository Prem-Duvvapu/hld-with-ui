package com.hld.api;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/** HTTP safeguards, outside virtual-time/model semantics. */
@ConfigurationProperties("hld.http")
@Validated
public record HttpExecutionLimits(
        @Min(512) @Max(1_048_576) int maxRequestBytes,
        @Min(512) @Max(16_777_216) int maxSimulationResponseBytes,
        @Min(1) @Max(32) int maxConcurrentSimulations) {}
