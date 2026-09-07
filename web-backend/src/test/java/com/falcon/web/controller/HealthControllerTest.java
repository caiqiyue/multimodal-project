package com.falcon.web.controller;

import com.falcon.web.config.UpstreamProperties;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.web.reactive.function.client.WebClient;

import java.io.IOException;

import static org.junit.jupiter.api.Assertions.*;

class HealthControllerTest {

  private MockWebServer upstream;
  private HealthController controller;

  @BeforeEach
  void setUp() throws IOException {
    upstream = new MockWebServer();
    upstream.start();
    UpstreamProperties props = new UpstreamProperties(
        upstream.url("").toString(),
        "/api/v1/ws/chat",
        "/health",
        1000,
        2000
    );
    WebClient client = WebClient.builder()
        .baseUrl(props.baseUrl())
        .clientConnector(new ReactorClientHttpConnector(
            reactor.netty.http.client.HttpClient.create()
                .responseTimeout(java.time.Duration.ofMillis(props.readTimeoutMs()))))
        .build();
    controller = new HealthController(client, props);
  }

  @AfterEach
  void tearDown() throws IOException {
    upstream.shutdown();
  }

  @Test
  void healthReportsUpWhenUpstreamReachable() {
    upstream.enqueue(new MockResponse().setBody("{\"status\":\"ok\"}")
        .addHeader("Content-Type", "application/json"));
    ResponseEntity<java.util.Map<String, Object>> response = controller.health().block();
    assertNotNull(response);
    assertEquals(HttpStatus.OK, response.getStatusCode());
    java.util.Map<String, Object> body = response.getBody();
    assertNotNull(body);
    assertEquals("up", body.get("status"));
    @SuppressWarnings("unchecked")
    var upstreamInfo = (java.util.Map<String, Object>) body.get("upstream");
    assertEquals(true, upstreamInfo.get("reachable"));
  }

  @Test
  void healthReportsDegradedWhenUpstreamDown() throws IOException {
    upstream.shutdown();
    ResponseEntity<java.util.Map<String, Object>> response = controller.health().block();
    assertNotNull(response);
    assertEquals(HttpStatus.SERVICE_UNAVAILABLE, response.getStatusCode());
    java.util.Map<String, Object> body = response.getBody();
    assertNotNull(body);
    assertEquals("degraded", body.get("status"));
  }
}
