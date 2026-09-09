package com.falcon.web.ws;

import lombok.extern.slf4j.Slf4j;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import org.springframework.web.reactive.socket.WebSocketSession;
import reactor.core.publisher.Mono;
import reactor.core.publisher.Sinks;

import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Session 035: use OkHttp WebSocket (more reliable on Mac than JDK
 * java.net.http.WebSocket, which has a bug where it stops delivering
 * frames after the first text message whose CompletionStage completes).
 *
 * Owns BOTH directions of the pump between a Vue WebSocket session and
 * the FastAPI upstream. Returns a Mono that completes when either side ends.
 */
@Slf4j
public class UpstreamChatClient {

  private final String upstreamUrl;
  private final WebSocketSession vueSession;
  private final Runnable onClose;
  private final AtomicReference<okhttp3.WebSocket> upstreamSocket = new AtomicReference<>();
  private final AtomicBoolean upstreamOpen = new AtomicBoolean(false);
  /** Emits a signal when the upstream WS closes (any reason). */
  private final Sinks.Empty<Void> upstreamClosed = Sinks.empty();

  public UpstreamChatClient(String upstreamUrl, WebSocketSession vueSession, Runnable onClose) {
    this.upstreamUrl = upstreamUrl;
    this.vueSession = vueSession;
    this.onClose = onClose;
  }

  public Mono<Void> connect() {
    log.info("UpstreamChatClient connecting via OkHttp to upstream url={}", upstreamUrl);
    OkHttpClient client = new OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)  // 0 = no read timeout (long-lived)
        .pingInterval(20, TimeUnit.SECONDS)     // keep-alive
        .build();

    Request request = new Request.Builder()
        .url(upstreamUrl)
        .build();

    okhttp3.WebSocket okWs = client.newWebSocket(request, new WebSocketListener() {
      @Override
      public void onOpen(WebSocket webSocket, Response response) {
        log.info("UpstreamChatClient upstream connected url={} status={}",
            upstreamUrl, response.code());
        upstreamOpen.set(true);
      }

      @Override
      public void onMessage(WebSocket webSocket, String text) {
        // Pump A: upstream -> Vue
        log.info("Pump A onMessage {} bytes: {}",
            text.length(),
            text.length() > 200 ? text.substring(0, 200) + "..." : text);
        vueSession.send(Mono.just(vueSession.textMessage(text)))
            .doOnError(err -> log.warn("Pump A send error: {}", err.toString()))
            .doOnSuccess(v -> log.info("Pump A sent {} bytes to Vue", text.length()))
            .subscribe();
      }

      @Override
      public void onClosing(WebSocket webSocket, int code, String reason) {
        log.info("UpstreamChatClient upstream closing code={} reason={}", code, reason);
        webSocket.close(1000, null);
      }

      @Override
      public void onClosed(WebSocket webSocket, int code, String reason) {
        log.info("UpstreamChatClient upstream closed code={} reason={}", code, reason);
        upstreamOpen.set(false);
        upstreamClosed.tryEmitEmpty();
      }

      @Override
      public void onFailure(WebSocket webSocket, Throwable t, Response response) {
        log.warn("UpstreamChatClient upstream failure: {} response={}", t.toString(),
            response == null ? "(none)" : response.code());
        upstreamOpen.set(false);
        upstreamClosed.tryEmitEmpty();
      }
    });
    upstreamSocket.set(okWs);

    // Pump B: Vue -> upstream. Forward every Vue frame to upstream WS.
    vueSession.receive()
        .doOnNext(msg -> {
          String text = msg.getPayloadAsText();
          boolean ok = okWs.send(text);
          if (!ok) {
            log.warn("Pump B upstream.send returned false (backpressure?)");
          }
        })
        .doFinally(sig -> {
          log.info("UpstreamChatClient Pump B finished sig={}", sig);
          if (upstreamOpen.compareAndSet(true, false)) {
            okhttp3.WebSocket sock = upstreamSocket.get();
            if (sock != null) {
              try {
                sock.close(1000, "vue_disconnect");
              } catch (Exception ignored) {
                // already closed
              }
            }
          }
        })
        .subscribe();

    // The Mono completes when either upstream closes OR Vue's receive() ends.
    return Mono.fromFuture(upstreamClosed.asMono().toFuture())
        .doFinally(sig -> onClose.run());
  }

  /**
   * Force-close the upstream session. Safe to call when no session is open yet.
   */
  public void close() {
    if (upstreamOpen.compareAndSet(true, false)) {
      okhttp3.WebSocket s = upstreamSocket.get();
      if (s != null) {
        try {
          s.close(1000, "force_close");
        } catch (Exception ignored) {
          // already closed
        }
      }
    }
  }
}
