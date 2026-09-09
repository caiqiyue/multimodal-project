package com.falcon.web.ws;

import lombok.extern.slf4j.Slf4j;
import org.springframework.web.reactive.socket.WebSocketSession;
import reactor.core.publisher.Mono;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Session 035: replaced ReactorNettyWebSocketClient with JDK's standard
 * java.net.http.WebSocket. Reactor Netty's WS upgrade was hanging on Mac
 * (DNS resolver couldn't load native .jnilib despite dep present).
 * JDK HttpClient uses the OS's TCP stack directly — no native deps.
 *
 * Owns BOTH directions of the pump between a Vue WebSocket session and the FastAPI upstream.
 * Returns a Mono that completes when EITHER side ends.
 */
@Slf4j
public class UpstreamChatClient {

  private final String upstreamUrl;
  private final WebSocketSession vueSession;
  private final Runnable onClose;
  private final AtomicReference<WebSocket> upstreamSocket = new AtomicReference<>();
  private final AtomicBoolean upstreamOpen = new AtomicBoolean(false);
  private final CompletableFuture<Void> closeFuture = new CompletableFuture<>();

  public UpstreamChatClient(String upstreamUrl, WebSocketSession vueSession, Runnable onClose) {
    this.upstreamUrl = upstreamUrl;
    this.vueSession = vueSession;
    this.onClose = onClose;
  }

  public Mono<Void> connect() {
    log.info("UpstreamChatClient connecting via JDK HttpClient to upstream url={}", upstreamUrl);
    HttpClient httpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(10))
        .build();
    CompletableFuture<WebSocket> connectFuture = httpClient.newWebSocketBuilder()
        .connectTimeout(Duration.ofSeconds(10))
        .buildAsync(URI.create(upstreamUrl), new WebSocket.Listener() {
          @Override
          public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
            // Pump A: upstream -> Vue
            // Use subscribe() not .toFuture() — the Mono from vueSession.send
            // doesn't always await cleanly via toFuture, leaving the listener
            // hanging and subsequent frames blocked.
            String text = data.toString();
            vueSession.send(Mono.just(vueSession.textMessage(text))).subscribe();
            return null;
          }

          @Override
          public void onOpen(WebSocket webSocket) {
            log.info("UpstreamChatClient upstream connected url={}", upstreamUrl);
            upstreamOpen.set(true);
            WebSocket.Listener.super.onOpen(webSocket);
          }

          @Override
          public CompletionStage<?> onClose(WebSocket webSocket, int statusCode, String reason) {
            log.info("UpstreamChatClient upstream closed status={} reason={}", statusCode, reason);
            closeFuture.complete(null);
            return null;
          }

          @Override
          public void onError(WebSocket webSocket, Throwable error) {
            log.warn("UpstreamChatClient upstream error: {}", error.toString());
            closeFuture.complete(null);
          }
        });

    return Mono.fromFuture(connectFuture)
        .doOnNext(ws -> {
          upstreamSocket.set(ws);
          log.info("UpstreamChatClient starting Pump B (Vue -> upstream) sessionId={}",
              vueSession.getId());
          // Pump B: Vue -> upstream. Forward every Vue frame to upstream WS.
          vueSession.receive()
              .doOnNext(msg -> {
                String text = msg.getPayloadAsText();
                ws.sendText(text, true);
              })
              .doFinally(sig -> {
                log.info("UpstreamChatClient Pump B finished sig={}", sig);
                if (upstreamOpen.compareAndSet(true, false)) {
                  WebSocket sock = upstreamSocket.get();
                  if (sock != null) {
                    try {
                      sock.sendClose(WebSocket.NORMAL_CLOSURE, "vue_disconnect");
                    } catch (Exception ignored) {
                      // already closed
                    }
                  }
                }
                closeFuture.complete(null);
              })
              .subscribe();
        })
        .then(Mono.fromFuture(closeFuture))
        .doFinally(sig -> onClose.run());
  }

  /**
   * Force-close the upstream session. Safe to call when no session is open yet.
   */
  public void close() {
    if (upstreamOpen.compareAndSet(true, false)) {
      WebSocket s = upstreamSocket.get();
      if (s != null) {
        try {
          s.sendClose(WebSocket.NORMAL_CLOSURE, "force_close");
        } catch (Exception ignored) {
          // already closed
        }
      }
    }
  }
}
