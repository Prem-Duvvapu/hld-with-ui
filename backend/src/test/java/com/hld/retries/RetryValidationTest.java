package com.hld.retries;

import static com.hld.retries.RetryTestInputs.configured;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.hld.retries.RetryInput.Backoff;
import com.hld.retries.RetryInput.Jitter;
import com.hld.retries.RetryInput.Request;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.function.Consumer;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

class RetryValidationTest {
    static Stream<Arguments> malformed() {
        var cases = new ArrayList<Arguments>();
        cases.add(Arguments.of("null input", null));
        for (String value : Arrays.asList(null, "", "2.0")) {
            cases.add(Arguments.of("schema " + value, configured(c -> c.schema = value)));
            cases.add(Arguments.of("model " + value, configured(c -> c.model = value)));
        }
        for (Long value : Arrays.asList(null, -9007199254740992L, 9007199254740992L))
            cases.add(Arguments.of("seed " + value, configured(c -> c.seed = value)));
        List<Consumer<RetryTestInputs.Config>> edits = List.of(
                c -> c.workers = null, c -> c.workers = 0, c -> c.workers = 4,
                c -> c.queue = null, c -> c.queue = -1, c -> c.queue = 13,
                c -> c.attemptTimeout = null, c -> c.attemptTimeout = 0, c -> c.attemptTimeout = 1001,
                c -> c.overallTimeout = null, c -> c.overallTimeout = 0, c -> c.overallTimeout = 10001,
                c -> c.maxAttempts = null, c -> c.maxAttempts = 0, c -> c.maxAttempts = 6,
                c -> c.backoff = null, c -> c.jitter = null,
                c -> c.base = null, c -> c.base = -1, c -> c.base = 1001,
                c -> c.cap = null, c -> c.cap = -1, c -> c.cap = 1001,
                c -> c.budget = null, c -> c.budget = -1, c -> c.budget = 49,
                c -> c.unavailable = null, c -> c.unavailable = -1, c -> c.unavailable = 10001,
                c -> c.base = 1, c -> c.cap = 1, c -> c.jitter = Jitter.FULL,
                c -> { c.backoff = Backoff.EXPONENTIAL; c.base = 0; c.cap = 1; },
                c -> { c.backoff = Backoff.EXPONENTIAL; c.base = 2; c.cap = 1; },
                c -> c.requests = null, c -> c.requests = List.of(),
                c -> c.requests = Arrays.asList((Request) null),
                c -> c.requests = List.of(new Request("a", 0, 1), new Request("a", 0, 2)),
                c -> c.requests = List.of(new Request("a", 1, 1), new Request("b", 0, 1)),
                c -> c.requests = java.util.stream.IntStream.range(0, 13).mapToObj(i -> new Request("r" + i, 0, 1)).toList());
        for (int i = 0; i < edits.size(); i++) cases.add(Arguments.of("invalid scalar/list " + i, configured(edits.get(i))));
        for (String id : Arrays.asList(null, "", "A", "1a", " a", "a ", "a\n", "é", "a".repeat(33)))
            cases.add(Arguments.of("identity " + id, configured(c -> c.requests = List.of(new Request(id, 0, 1)))));
        for (Integer arrival : Arrays.asList(null, -1, 10001))
            cases.add(Arguments.of("arrival " + arrival, configured(c -> c.requests = List.of(new Request("a", arrival, 1)))));
        for (Integer service : Arrays.asList(null, 0, 1001))
            cases.add(Arguments.of("service " + service, configured(c -> c.requests = List.of(new Request("a", 0, service)))));
        return cases.stream();
    }
    @ParameterizedTest(name = "{0}") @MethodSource("malformed")
    void rejectsCompleteMalformedInputBeforeAnyRunCanMutateState(String label, RetryInput input) {
        assertThatThrownBy(() -> RetryValidator.validate(input)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new RetrySimulator().run(input)).isInstanceOf(IllegalArgumentException.class);
    }
    @Test void inclusiveBoundariesAndAllPurePresetsAreLegal() {
        for (var preset : RetryPresets.all()) {
            RetryValidator.validate(preset.input());
            assertThat(new RetrySimulator().run(preset.input()).status()).isEqualTo("completed");
        }
        RetryValidator.validate(RetryTestInputs.maximumInput());
        RetryValidator.validate(configured(c -> {
            c.seed = -9007199254740991L; c.queue = 0; c.budget = 0;
            c.requests = List.of(new Request("a", 0, 1));
        }));
        RetryValidator.validate(configured(c -> {
            c.backoff = Backoff.EXPONENTIAL; c.base = 1000; c.cap = 1000; c.jitter = Jitter.FULL;
            c.attemptTimeout = 1000; c.overallTimeout = 10000; c.unavailable = 10000;
        }));
    }
}
