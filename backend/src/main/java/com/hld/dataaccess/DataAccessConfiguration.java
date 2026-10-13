package com.hld.dataaccess;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
public class DataAccessConfiguration {
    @Bean public DataAccessAnalyzer dataAccessAnalyzer() { return new DataAccessAnalyzer(); }
}
