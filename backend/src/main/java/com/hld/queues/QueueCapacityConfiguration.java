package com.hld.queues;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Deliberate API registration; the simulator remains usable without a Spring container. */
@Configuration(proxyBeanMethods = false)
public class QueueCapacityConfiguration {
    @Bean
    public QueueCapacitySimulator queueCapacitySimulator() {
        return new QueueCapacitySimulator();
    }
}
