package com.hld.api;

import com.hld.queues.QueueCapacityDescriptor;
import com.hld.queues.QueueCapacityDescriptor.Preset;
import com.hld.queues.QueueCapacityInput;
import com.hld.queues.QueueCapacityInput.Job;
import com.hld.queues.QueueCapacityLimits;
import com.hld.queues.QueueCapacitySimulator;
import jakarta.validation.ConstraintViolationException;
import jakarta.validation.Validator;
import java.util.List;
import java.util.Set;
import java.util.stream.IntStream;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.core.JacksonException;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.ObjectReader;

@RestController
@RequestMapping("/api/v1/simulations/queues-tail-latency")
public class QueueCapacityController {
    private static final Set<String> INPUT_FIELDS = Set.of("schemaVersion", "modelVersion", "workers", "queueCapacity", "jobs", "seed");
    private static final Set<String> JOB_FIELDS = Set.of("id", "arrivalTimeMs", "serviceTimeMs");
    private final QueueCapacitySimulator simulator;
    private final SimulationResponses responses;
    private final ObjectMapper mapper;
    private final ObjectReader reader;
    private final Validator validator;

    public QueueCapacityController(QueueCapacitySimulator simulator, SimulationResponses responses,
            ObjectMapper mapper, Validator validator) {
        this.simulator = simulator;
        this.responses = responses;
        this.mapper = mapper;
        this.validator = validator;
        this.reader = mapper.readerFor(JsonNode.class)
                .with(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
                .with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
    }

    @GetMapping
    public QueueCapacityDescriptor descriptor() {
        return new QueueCapacityDescriptor(QueueCapacitySimulator.SIMULATION_ID,
                "Queues & Tail Latency", "simulation", QueueCapacitySimulator.MODEL_VERSION,
                "A bounded shared FIFO waiting queue with per-job service times and a finite worker pool.",
                QueueCapacityLimits.CURRENT,
                List.of(
                        new Preset("baseline", "One waiting slot",
                                "Which two jobs finish, and why are the other two rejected?", input(1, 1, burst(10))),
                        new Preset("larger-buffer", "More waiting space",
                                "Does a larger buffer improve processing capacity or increase waiting?", input(1, 3, burst(10))),
                        new Preset("more-workers", "More workers",
                                "How do worker slots differ from waiting slots?", input(2, 1, burst(10))),
                        new Preset("slow-job", "Slow first job",
                                "How does the first job's service time affect the jobs behind it?",
                                input(1, 3, List.of(new Job("job-1", 0, 100), new Job("job-2", 0, 1),
                                        new Job("job-3", 0, 1), new Job("job-4", 0, 1)))),
                        new Preset("virtual-limit", "Virtual-time limit",
                                "Can a scheduled completion be reported as an actual completion?",
                                input(1, 1, List.of(new Job("last-job", 60_000, 10_000))))),
                QueueCapacitySimulator.ASSUMPTIONS);
    }

    @PostMapping("/runs")
    public ResponseEntity<byte[]> run(@RequestBody byte[] body) {
        return responses.json(simulator.run(readInput(body)));
    }

    private QueueCapacityInput readInput(byte[] body) {
        try {
            JsonNode json = reader.readValue(body);
            exactFields(json, INPUT_FIELDS, "input");
            text(json, "schemaVersion");
            text(json, "modelVersion");
            integer(json, "workers", true);
            integer(json, "queueCapacity", true);
            integer(json, "seed", false);
            JsonNode jobs = json.get("jobs");
            if (!jobs.isArray() || jobs.isEmpty() || jobs.size() > QueueCapacitySimulator.MAX_JOBS) {
                throw new IllegalArgumentException("jobs must be an array of 1–100 job objects.");
            }
            for (JsonNode job : jobs) {
                exactFields(job, JOB_FIELDS, "job");
                text(job, "id");
                integer(job, "arrivalTimeMs", false);
                integer(job, "serviceTimeMs", false);
            }
            QueueCapacityInput input = mapper.treeToValue(json, QueueCapacityInput.class);
            var violations = validator.validate(input);
            if (!violations.isEmpty()) throw new ConstraintViolationException(violations);
            return input;
        } catch (JacksonException exception) {
            throw new IllegalArgumentException("The request must contain one valid queue-input JSON object.", exception);
        }
    }

    private static void exactFields(JsonNode node, Set<String> fields, String label) {
        if (node == null || !node.isObject() || !Set.copyOf(node.propertyNames()).equals(fields)) {
            throw new IllegalArgumentException(label + " contains missing or unknown fields.");
        }
    }

    private static void text(JsonNode object, String name) {
        if (!object.get(name).isString()) throw new IllegalArgumentException(name + " must be a string.");
    }

    private static void integer(JsonNode object, String name, boolean small) {
        JsonNode value = object.get(name);
        if (!value.isIntegralNumber() || !value.canConvertToLong() || (small && !value.canConvertToInt())) {
            throw new IllegalArgumentException(name + " must be an integer JSON number in range.");
        }
    }

    private static QueueCapacityInput input(int workers, int capacity, List<Job> jobs) {
        return new QueueCapacityInput(QueueCapacityInput.SCHEMA_VERSION, QueueCapacityInput.MODEL_VERSION,
                workers, capacity, jobs, 7);
    }

    private static List<Job> burst(long service) {
        return IntStream.rangeClosed(1, 4).mapToObj(i -> new Job("job-" + i, 0, service)).toList();
    }
}
