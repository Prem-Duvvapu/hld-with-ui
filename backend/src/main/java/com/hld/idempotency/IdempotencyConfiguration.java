package com.hld.idempotency;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Framework registration leaves every simulation invocation's state local. */
@Configuration(proxyBeanMethods = false)
public class IdempotencyConfiguration {
    @Bean
    public IdempotencySimulator idempotencySimulator() { return new IdempotencySimulator(); }
}
