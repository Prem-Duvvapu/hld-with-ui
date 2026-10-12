package com.hld.queues;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.hld.api.HttpExecutionLimits;
import com.hld.queues.QueueCapacityInput.Job;
import com.hld.simulation.engine.SimulationBudget;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import tools.jackson.databind.ObjectMapper;

/** Application Jackson configuration, with no HTTP server or registered queue endpoint. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
class QueueCapacitySerializationTest {
    @Autowired ObjectMapper mapper;
    @Autowired HttpExecutionLimits httpLimits;

    @Test void baselineExampleIsActualJavaOutputAndTrackedExamplesCannotDrift() throws Exception {
        var expectedInput = QueueCapacitySimulatorTest.input(1, 1, QueueCapacitySimulatorTest.burst(4, 10));
        var inputFile = Path.of("../contracts/examples/queue-capacity-baseline-input.json");
        assertThat(mapper.readTree(Files.readAllBytes(inputFile)))
                .isEqualTo(mapper.readTree(mapper.writeValueAsBytes(expectedInput)));
        var input = mapper.readValue(Files.readAllBytes(inputFile), QueueCapacityInput.class);
        var result = new QueueCapacitySimulator().run(input);
        byte[] json = mapper.writeValueAsBytes(result);
        Path generated = Path.of("target/queue-capacity-baseline-result.json");
        Files.createDirectories(generated.getParent());
        Files.write(generated, json);
        var tracked = Path.of("../contracts/examples/queue-capacity-baseline-result.json");
        assertThat(tracked).exists();
        assertThat(mapper.readTree(json)).isEqualTo(mapper.readTree(Files.readAllBytes(tracked)));
        assertThat(mapper.readTree(json).get("metrics").get("completed").asInt()).isEqualTo(2);
        assertThat(mapper.readTree(json).get("events").get(0).get("kind").asString()).isEqualTo("job.started");
        QueueCapacitySimulatorTest.assertObservedPrefix(result);
    }

    @Test void actualSnapshotJsonRemainsBoundedAtSmallAndDefaultTraceLimits() {
        List<Job> jobs = java.util.stream.IntStream.range(0, 100)
                .mapToObj(i -> new Job("j" + "x".repeat(28) + String.format("%03d", i), 0, 1)).toList();
        assertThat(jobs).allSatisfy(job -> assertThat(job.id()).hasSize(32));
        var input = QueueCapacitySimulatorTest.input(8, 100, jobs);
        assertThat(mapper.writeValueAsBytes(input).length).isLessThanOrEqualTo(httpLimits.maxRequestBytes());
        for (long limit : new long[] {2, 512, 4096, 32_768, SimulationBudget.DEFAULT_MAX_TRACE_BYTES}) {
            var result = new QueueCapacitySimulator(new SimulationBudget(10_000, 60_000, limit, 0)).run(input);
            byte[] events = mapper.writeValueAsBytes(result.events());
            assertThat(events.length).as("full event snapshots at budget %d", limit).isLessThanOrEqualTo((int) limit);
            assertThat(mapper.readTree(events).size()).isEqualTo(result.events().size());
            assertThat(mapper.writeValueAsBytes(result).length).isLessThanOrEqualTo(httpLimits.maxSimulationResponseBytes());
            if (limit < SimulationBudget.DEFAULT_MAX_TRACE_BYTES) {
                assertThat(result.status()).isEqualTo("limited");
                assertThat(result.truncationReason()).isEqualTo("trace_size_limit");
            } else {
                assertThat(result.status()).isEqualTo("completed");
                assertThat(result.metrics().completed()).isEqualTo(100);
                assertThat(result.metrics().rejected()).isZero();
            }
            QueueCapacitySimulatorTest.assertObservedPrefix(result);
            System.out.printf("QUEUE_CAPACITY_SERIALIZATION budget=%d events=%d eventBytes=%d responseBytes=%d status=%s%n",
                    limit, result.events().size(), events.length, mapper.writeValueAsBytes(result).length, result.status());
        }
    }

    @Test void configuredJacksonRejectsUnknownInputFieldsAndTrailingRoots() {
        String valid = mapper.writeValueAsString(QueueCapacitySimulatorTest.input(1, 1, QueueCapacitySimulatorTest.burst(1, 10)));
        assertThatThrownBy(() -> mapper.readValue(valid.substring(0, valid.length() - 1) + ",\"invented\":true}", QueueCapacityInput.class))
                .isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> mapper.readValue(valid + "{}", QueueCapacityInput.class)).isInstanceOf(RuntimeException.class);
    }
}
