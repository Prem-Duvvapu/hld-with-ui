package com.hld.transactions;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Registration is outside the pure domain; the analyzer retains no per-request state. */
@Configuration(proxyBeanMethods = false)
public class ReservationConfiguration {
    @Bean
    public ReservationAnalyzer reservationAnalyzer() {
        return new ReservationAnalyzer();
    }
}
