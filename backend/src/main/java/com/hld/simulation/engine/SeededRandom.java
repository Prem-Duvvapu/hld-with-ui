package com.hld.simulation.engine;

import java.util.SplittableRandom;

/**
 * A versioned, seeded pseudo-random number generator wrapper.
 * <p>
 * Uses {@link SplittableRandom} for reproducible sequences. It lives in
 * {@code java.base}, so it exists on every Java runtime, including JRE
 * images without the {@code jdk.random} module that provides
 * {@code L64X128MixRandom}. The algorithm name is recorded so future
 * changes can detect incompatible replay.
 * <p>
 * Two separate instances should be used for workload randomness and
 * failure randomness so that a comparison can retain the same arrivals
 * while varying failures.
 */
public final class SeededRandom {
    static final String ALGORITHM = "SplittableRandom";
    private final SplittableRandom generator;

    public SeededRandom(long seed) {
        this.generator = new SplittableRandom(seed);
    }

    /** Returns the algorithm name for replay compatibility checks. */
    public String algorithm() {
        return ALGORITHM;
    }

    /** Returns a uniformly distributed {@code int} in {@code [0, bound)}. */
    public int nextInt(int bound) {
        return generator.nextInt(bound);
    }

    /** Returns a uniformly distributed {@code long}. */
    public long nextLong() {
        return generator.nextLong();
    }

    /** Returns a uniformly distributed {@code double} in {@code [0, 1)}. */
    public double nextDouble() {
        return generator.nextDouble();
    }
}
