package com.hld.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

class SimulationResponsesTest {
    private final ObjectMapper mapper = JsonMapper.builder().build();
    private final SimulationResponses responses = new SimulationResponses(mapper, new HttpExecutionLimits(512, 512, 1));

    @Test void acceptsTheExactUtf8BoundaryAndRejectsTheNextByte() {
        var exact = responses.json(Map.of("data", "a".repeat(501)));
        assertThat(exact.getBody()).hasSize(512);
        assertThat(mapper.readTree(exact.getBody()).get("data").asString()).hasSize(501);
        assertThat(exact.getHeaders().getContentType().toString()).isEqualTo("application/json");
        assertThatThrownBy(() -> responses.json(Map.of("data", "a".repeat(502))))
                .isInstanceOfSatisfying(HttpResourceException.class, e -> {
                    assertThat(e.code()).isEqualTo("result_too_large");
                    assertThat(e.status().value()).isEqualTo(422);
                });
    }

    @Test void boundsUtf8AndJsonEscapesRatherThanCharacterCount() {
        for (String value : new String[] {"雪".repeat(168), "\u0001".repeat(86)}) {
            assertThat(value.length()).isLessThan(512);
            assertThatThrownBy(() -> responses.json(Map.of("data", value))).isInstanceOf(HttpResourceException.class);
        }
        assertThat(new String(responses.json(Map.of("data", "雪🌱")).getBody(), StandardCharsets.UTF_8))
                .isEqualTo(mapper.writeValueAsString(Map.of("data", "雪🌱")));
    }

    @Test void doesNotRelabelOtherSerializationFailuresAsSizeErrors() {
        class Broken { public String getValue() { throw new IllegalStateException("broken getter"); } }
        assertThatThrownBy(() -> responses.json(new Broken())).isNotInstanceOf(HttpResourceException.class);
    }
}
