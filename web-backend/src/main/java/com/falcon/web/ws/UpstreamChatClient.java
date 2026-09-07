package com.falcon.web.ws;

import lombok.extern.slf4j.Slf4j;
import org.springframework.web.reactive.socket.CloseStatus;
import org.springframework.web.reactive.socket.WebSocketHandler;
import org.springframework.web.reactive.socket.WebSocketSession;
import org.springframework.web.reactive.socket.client.ReactorNettyWebSocketClient;
import org.springframework.web.reactive.socket.client.WebSocketClient;
import reactor.core.publisher.Mono;
import reactor.netty.http.client.HttpClient;

import java.net.URI;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Owns BOTH directions of the pump between a Vue WebSocket session and the FastAPI upstream.
 * <p>
 * Pump A: upstream.receive()  -> vueSession.send()    (raw text frames forwarded as text)
 * Pump B: vueSession.receive() -> upstream.send()     (raw text frames forwarded as text)
 * <p>
 * The pump completes when EITHER side ends. {@link Mono#first(Mono, Mono)} returns whichever
 * finishes first, at which point {@link #onClose} is invoked to tear down the other side.
 * <p>
 * {@link #close()} is also exposed so {@link ChatRelayHandler} can request a forced shutdown
 * (used by {@code @PreDestroy} and by Vue-side disconnect cleanup).
 */
@Slf4j
public class UpstreamChatClient {

  private final String upstreamUrl;
  private final WebSocketSession vueSession;
  private final Runnable onClose;
  private final WebSocketClient client;
  private final AtomicReference<WebSocketSession> upstreamSession = new AtomicReference<>();

  public UpstreamChatClient(String upstreamUrl, WebSocketSession vueSession, Runnable onClose) {
    this.upstreamUrl = upstreamUrl;
    this.vueSession = vueSession;
    this.onClose = onClose;
    this.client = new ReactorNettyWebSocketClient(HttpClient.create()
        .responseTimeout(Duration.ofSeconds(600)));
  }

  public Mono<Void> connect() {
    WebSocketHandler handler = new WebSocketHandler() {
      @Override
      public Mono<Void> handle(WebSocketSession upstream) {
        upstreamSession.set(upstream);

        // Pump A: upstream -> Vue (forward each frame as text)
        Mono<Void> upstreamToVue = upstream.receive()
            .map(org.springframework.web.reactive.socket.WebSocketMessage::getPayloadAsText)
            .flatMap(text -> vueSession.send(Mono.just(vueSession.textMessage(text))))
            .doFinally(sig -> onClose.run())
            .then();

        // Pump B: Vue -> upstream (forward Vue's inbound)
        Mono<Void> vueToUpstream = vueSession.receive()
            .flatMap(msg -> upstream.send(Mono.just(
                upstream.textMessage(msg.getPayloadAsText()))))
            .doFinally(sig -> {
              if (upstream.isOpen()) {
                upstream.close(CloseStatus.GOING_AWAY).subscribe();
              }
            })
            .then();

        // Whichever pump finishes first wins; the doFinally above triggers cleanup.
        return Mono.first(upstreamToVue, vueToUpstream);
      }
    };
    return client.execute(URI.create(upstreamUrl), handler);
  }

  /**
   * Force-close the upstream session. Safe to call when no session is open yet.
   */
  public void close() {
    WebSocketSession s = upstreamSession.get();
    if (s != null && s.isOpen()) {
      s.close(CloseStatus.GOING_AWAY).subscribe();
    }
  }
}
