package com.hld.delivery;

import static org.assertj.core.api.Assertions.assertThat;

import com.hld.delivery.DeliveryInput.AcknowledgmentPolicy;
import com.hld.delivery.DeliveryInput.Consumer;
import com.hld.delivery.DeliveryInput.Message;
import com.hld.simulation.engine.SimulationBudget;

import org.junit.jupiter.api.Test;

import java.util.List;

class DeliveryObservationWindowTest {
    @Test
    void boundaryArrivalRemainsUnfinishedByDefaultAndAnExplicitLargerWindowObservesSettlement() {
        var input =
                new DeliveryInput(
                        "1.0",
                        "1.0.0",
                        List.of(new Message("m1", 60_000)),
                        List.of(new Consumer("c1")),
                        1000,
                        1000,
                        60_000,
                        3,
                        AcknowledgmentPolicy.ACK_AFTER_EFFECT,
                        List.of(),
                        List.of(),
                        42);
        var prefix = new DeliverySimulator().run(input);
        assertThat(prefix.status()).isEqualTo("limited");
        assertThat(prefix.truncationReason()).isEqualTo("virtual_time_limit");
        assertThat(prefix.lastVirtualTimeMs()).isEqualTo(60_000);
        assertThat(prefix.ledger()).isEmpty();
        assertThat(prefix.metrics().runningEffects()).isEqualTo(1);
        assertThat(prefix.metrics().pendingAcknowledgments()).isEqualTo(1);
        assertThat(prefix.metrics().acknowledgedWithoutEffect()).isNull();
        assertThat(prefix.attemptOutcomes().get(0).scheduledEffectAtMs()).isEqualTo(61_000);
        assertThat(prefix.attemptOutcomes().get(0).scheduledAckAtMs()).isEqualTo(62_000);
        var observed =
                new DeliverySimulator(new SimulationBudget(10_000, 62_000, 2_097_152, 0))
                        .run(input);
        assertThat(observed.status()).isEqualTo("completed");
        assertThat(observed.lastVirtualTimeMs()).isEqualTo(62_000);
        assertThat(observed.metrics().deliveryAttempts()).isEqualTo(1);
        assertThat(observed.metrics().committedEffects()).isEqualTo(1);
        assertThat(observed.metrics().meanAckLatencyMs()).isEqualTo(2000);
        assertThat(observed.metrics().meanFirstEffectLatencyMs()).isEqualTo(1000);
        assertThat(observed.metrics().acknowledgedWithoutEffect()).isZero();
        // Accepted ACK invalidates the otherwise later expiry at120,000 ms.
        assertThat(observed.events())
                .noneMatch(event -> event.kind() == DeliveryEvent.Kind.LEASE_EXPIRED);
    }
}
