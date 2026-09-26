package com.hld.simulation.engine;

/**
 * Specifies what happens to work already assigned to an entity when it
 * fails. Each value has concrete semantics that the model must implement.
 */
public enum InFlightBehavior {
    /**
     * In-flight and queued work fails immediately at the failure time.
     * This is the initial default for request-flow.
     */
    FAIL,

    /**
     * In-flight work completes normally; queued work fails. Future use
     * for graceful-shutdown modeling.
     */
    COMPLETE,

    /**
     * In-flight and queued work pauses; they resume upon recovery. Not
     * yet implemented; reserved for future model versions.
     */
    PAUSE
}
