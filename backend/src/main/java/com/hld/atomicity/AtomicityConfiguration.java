package com.hld.atomicity;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Framework registration stays outside the pure request-local analyzer. */
@Configuration(proxyBeanMethods = false)
public class AtomicityConfiguration {
    @Bean
    public AtomicityAnalyzer atomicityAnalyzer() { return new AtomicityAnalyzer(); }
}
