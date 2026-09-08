package com.falcon.web.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

/**
 * Bound to {@code falcon.cors.allowed-origins} via Spring Boot's relaxed
 * binding (kebab-case ↔ camelCase ↔ PascalCase ↔ UPPER_SNAKE_CASE).
 *
 * <p>Replaces the previous {@code @Value("${falcon.cors.allowed-origins}")}
 * approach, which failed because {@code @Value} placeholders do NOT support
 * kebab-case relaxed binding — only {@code @ConfigurationProperties} does.
 *
 * <p>See Task 8 Subtask B + feat-167 acceptance gate.
 */
@ConfigurationProperties(prefix = "falcon.cors")
public record CorsProperties(List<String> allowedOrigins) {
}
