package com.falcon.web.controller;

import com.falcon.web.config.UpstreamProperties;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping(value = "/api/web", produces = MediaType.APPLICATION_JSON_VALUE)
public class HealthController {

  private final WebClient webClient;
  private final UpstreamProperties props;

  public HealthController(WebClient upstreamWebClient, UpstreamProperties props) {
    this.webClient = upstreamWebClient;
    this.props = props;
  }

  @GetMapping("/health")
  public Mono<ResponseEntity<Map<String, Object>>> health() {
    Map<String, Object> upstream = new LinkedHashMap<>();
    upstream.put("url", props.baseUrl());
    try {
      String body = webClient.get()
          .uri(props.healthPath())
          .retrieve()
          .bodyToMono(String.class)
          .timeout(Duration.ofMillis(props.connectTimeoutMs()))
          .block();
      upstream.put("reachable", true);
      upstream.put("body", body);
      return Mono.just(ResponseEntity.ok(Map.of("status", "up", "upstream", upstream)));
    } catch (Exception e) {
      upstream.put("reachable", false);
      upstream.put("error", e.getClass().getSimpleName() + ": " + e.getMessage());
      return Mono.just(ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
          .body(Map.of("status", "degraded", "upstream", upstream)));
    }
  }
}
