package com.hld.delivery;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Deliberate registration keeps the domain simulator usable without a Spring context. */
@Configuration(proxyBeanMethods = false)
public class DeliveryConfiguration {
    @Bean
    public DeliverySimulator deliverySimulator() {
        return new DeliverySimulator();
    }
}
