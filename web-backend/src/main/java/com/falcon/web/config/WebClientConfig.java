package com.falcon.web.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.netty.http.client.HttpClient;

import java.time.Duration;

@Configuration
public class WebClientConfig {

  @Bean
  public WebClient upstreamWebClient(UpstreamProperties props) {
    HttpClient httpClient = HttpClient.create()
        .responseTimeout(Duration.ofMillis(props.readTimeoutMs()));
    return WebClient.builder()
        .baseUrl(props.baseUrl())
        .clientConnector(new ReactorClientHttpConnector(httpClient))
        .build();
  }
}