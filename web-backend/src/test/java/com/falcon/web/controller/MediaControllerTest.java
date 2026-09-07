package com.falcon.web.controller;

import com.falcon.web.config.UpstreamProperties;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import org.junit.jupiter.api.*;
import org.springframework.core.io.buffer.DefaultDataBufferFactory;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.MediaType;
import org.springframework.http.codec.multipart.FilePart;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Flux;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class MediaControllerTest {

  private MockWebServer upstream;
  private MediaController controller;

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
    controller = new MediaController(client);
  }

  @AfterEach
  void tearDown() throws IOException {
    upstream.shutdown();
  }

  @Test
  void uploadForwardsMultipartAndReturnsMediaId() throws InterruptedException {
    upstream.enqueue(new MockResponse()
        .setBody("{\"media_id\":\"m-1\",\"url\":\"http://x/m-1\",\"media_type\":\"image\",\"size_bytes\":42}")
        .addHeader("Content-Type", "application/json"));

    FilePart filePart = mock(FilePart.class);
    when(filePart.filename()).thenReturn("test.png");
    when(filePart.content()).thenReturn(Flux.just(
        new DefaultDataBufferFactory().allocateBuffer().write("PNG-DATA".getBytes(StandardCharsets.UTF_8))
    ));

    @SuppressWarnings("unchecked")
    Map<String, Object> result = controller.upload(filePart).block();
    assertNotNull(result);
    assertEquals("m-1", result.get("media_id"));

    var recorded = upstream.takeRequest();
    assertNotNull(recorded);
    assertEquals("POST", recorded.getMethod());
    assertEquals("/api/v1/media/upload", recorded.getPath());
  }
}
