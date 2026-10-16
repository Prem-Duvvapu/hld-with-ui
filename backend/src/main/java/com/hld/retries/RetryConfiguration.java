package com.hld.retries;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Framework registration does not change the pure run-local simulation. */
@Configuration(proxyBeanMethods = false)
public class RetryConfiguration {
    @Bean
    public RetrySimulator retrySimulator() { return new RetrySimulator(); }
}
