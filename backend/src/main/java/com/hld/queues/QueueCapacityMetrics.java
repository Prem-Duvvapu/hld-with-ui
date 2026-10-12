package com.hld.queues;

/** Successful wait/latency statistics use completed jobs only, with one declared sample count. */
public record QueueCapacityMetrics(int totalJobs, int completed, int rejected, int queued,
                                   int running, int notArrived, int successfulSamples,
                                   Double meanSuccessfulWaitMs, Double meanSuccessfulLatencyMs,
                                   Long p95SuccessfulWaitMs, Long p95SuccessfulLatencyMs,
                                   int peakWaiting, long observationStartMs, long observationEndMs,
                                   Double completedThroughputPerSecond) {}
