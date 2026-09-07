package com.falcon.web.controller;

import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.http.codec.multipart.FilePart;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.util.Map;

@RestController
@RequestMapping(value = "/api/web/media", produces = MediaType.APPLICATION_JSON_VALUE)
public class MediaController {

  private final WebClient webClient;

  public MediaController(WebClient upstreamWebClient) {
    this.webClient = upstreamWebClient;
  }

  @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public Mono<Map> upload(@RequestPart("file") FilePart file) {
    MultipartBodyBuilder mb = new MultipartBodyBuilder();
    mb.asyncPart("file", file.content(), DataBuffer.class);
    return webClient.post()
        .uri("/api/v1/media/upload")
        .contentType(MediaType.MULTIPART_FORM_DATA)
        .body(BodyInserters.fromMultipartData(mb.build()))
        .retrieve()
        .bodyToMono(Map.class);
  }
}
