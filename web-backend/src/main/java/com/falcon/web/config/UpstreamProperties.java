package com.falcon.web.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "falcon.upstream")
public record UpstreamProperties(
    String baseUrl,
    String wsPath,
    String healthPath,
    int connectTimeoutMs,
    int readTimeoutMs
) {}