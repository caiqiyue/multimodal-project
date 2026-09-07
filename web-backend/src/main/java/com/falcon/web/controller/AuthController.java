package com.falcon.web.controller;

import com.falcon.web.dto.LoginRequest;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.util.Map;

@RestController
@RequestMapping(value = "/api/web/auth", produces = MediaType.APPLICATION_JSON_VALUE)
public class AuthController {

  private final WebClient webClient;

  public AuthController(WebClient upstreamWebClient) {
    this.webClient = upstreamWebClient;
  }

  @PostMapping(value = "/login", consumes = MediaType.APPLICATION_JSON_VALUE)
  public Mono<Map> login(@Valid @RequestBody LoginRequest body) {
    return webClient.post()
        .uri("/api/v1/auth/login")
        .bodyValue(body)
        .retrieve()
        .bodyToMono(Map.class);
  }
}
