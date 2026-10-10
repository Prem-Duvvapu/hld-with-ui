package com.hld.api;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.validation.autoconfigure.ValidationAutoConfiguration;
import org.springframework.context.annotation.Configuration;

class HttpExecutionLimitsTest {
    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(HttpExecutionLimits.class)
    static class Properties {}
    private final ApplicationContextRunner context = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(ValidationAutoConfiguration.class))
            .withUserConfiguration(Properties.class)
            .withPropertyValues("hld.http.max-request-bytes=262144", "hld.http.max-simulation-response-bytes=4194304", "hld.http.max-concurrent-simulations=2");

    @Test void acceptsTheDocumentedDefaultsAndExplicitBounds() {
        context.run(app -> {
            assertThat(app).hasNotFailed();
            assertThat(app.getBean(HttpExecutionLimits.class)).isEqualTo(new HttpExecutionLimits(262144, 4194304, 2));
        });
        context.withPropertyValues("hld.http.max-request-bytes=512", "hld.http.max-simulation-response-bytes=512", "hld.http.max-concurrent-simulations=1")
                .run(app -> assertThat(app).hasNotFailed());
        context.withPropertyValues("hld.http.max-request-bytes=1048576", "hld.http.max-simulation-response-bytes=16777216", "hld.http.max-concurrent-simulations=32")
                .run(app -> assertThat(app).hasNotFailed());
    }

    @ParameterizedTest
    @ValueSource(strings = {"max-request-bytes=0", "max-request-bytes=511", "max-request-bytes=1048577",
            "max-simulation-response-bytes=0", "max-simulation-response-bytes=511", "max-simulation-response-bytes=16777217",
            "max-concurrent-simulations=0", "max-concurrent-simulations=33", "max-request-bytes=not-a-number"})
    void invalidConfigurationFailsStartup(String property) {
        context.withPropertyValues("hld.http." + property).run(app -> assertThat(app).hasFailed());
    }
}
