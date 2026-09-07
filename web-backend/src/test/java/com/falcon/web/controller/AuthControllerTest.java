package com.falcon.web.controller;

import com.falcon.web.config.UpstreamProperties;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import org.junit.jupiter.api.*;
import org.springframework.http.MediaType;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.web.reactive.function.client.WebClient;

import java.io.IOException;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class AuthControllerTest {

  private MockWebServer upstream;
  private AuthController controller;

  @BeforeEach
  void setUp() throws IOException {
    upstream = new MockWebServer();
    upstream.start();
    UpstreamProperties props = new UpstreamProperties(
        upstream.url("").toString(), "/x", "/x", 1000, 2000);
    WebClient client = WebClient.builder()
        .baseUrl(props.baseUrl())
        .clientConnector(new ReactorClientHttpConnector(
            reactor.netty.http.client.HttpClient.create()))
        .build();
    controller = new AuthController(client);
  }

  @AfterEach
  void tearDown() throws IOException {
    upstream.shutdown();
  }

  @Test
  void loginForwardsBodyAndReturnsUpstreamJwt() throws InterruptedException {
    upstream.enqueue(new MockResponse()
        .setBody("{\"access_token\":\"abc.def.ghi\",\"refresh_token\":\"xyz\",\"user\":{\"id\":\"u1\",\"username\":\"alice\"}}")
        .addHeader("Content-Type", "application/json"));

    var body = new com.falcon.web.dto.LoginRequest("alice", "demo1234");
    @SuppressWarnings("unchecked")
    Map<String, Object> result = controller.login(body).block();
    assertNotNull(result);
    assertEquals("abc.def.ghi", result.get("access_token"));

    var recorded = upstream.takeRequest();
    assertNotNull(recorded);
    assertEquals("POST", recorded.getMethod());
    assertEquals("/api/v1/auth/login", recorded.getPath());
    String reqBody = recorded.getBody().readUtf8();
    assertTrue(reqBody.contains("alice"));
    assertTrue(reqBody.contains("demo1234"));
  }

  @Test
  void loginReturns401WhenUpstreamReturns401() {
    upstream.enqueue(new MockResponse().setResponseCode(401)
        .setBody("{\"detail\":\"invalid username or password\"}")
        .addHeader("Content-Type", "application/json"));

    var body = new com.falcon.web.dto.LoginRequest("alice", "wrong");
    assertThrows(org.springframework.web.reactive.function.client.WebClientResponseException.class,
        () -> controller.login(body).block());
  }
}
