package com.falcon.web.ws;

import com.falcon.web.config.UpstreamProperties;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.socket.CloseStatus;
import org.springframework.web.reactive.socket.WebSocketHandler;
import org.springframework.web.reactive.socket.WebSocketSession;
import reactor.core.publisher.Mono;

import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Accepts Vue WebSocket connections at /api/web/ws/chat and relays frames to
 * the FastAPI upstream at ws://{baseUrl}{wsPath}?token=&lt;jwt&gt;.
 * <p>
 * Lifecycle:
 * <ul>
 *   <li>Each Vue connection gets a sessionId (UUID) and a 1:1 {@link UpstreamChatClient}.</li>
 *   <li>UpstreamChatClient owns BOTH pump directions and calls {@code onClose} on either-side end.</li>
 *   <li>{@code onClose} removes the entry from {@link #registry} and closes the Vue side.</li>
 *   <li>Upstream connect failure -> emit a wire {@code error} frame to Vue then close.</li>
 *   <li>{@link PreDestroy} closes all live relays and clears the registry.</li>
 * </ul>
 * Token passing: browser WS API cannot set custom headers, so the Vue client passes the JWT via
 * {@code ?token=&lt;jwt&gt;} query string; this handler reads it from the handshake URI and
 * appends it to the upstream WS URI.
 */
@Slf4j
@Component
public class ChatRelayHandler implements WebSocketHandler {

  private final UpstreamProperties props;
  private final ConcurrentHashMap<String, UpstreamChatClient> registry = new ConcurrentHashMap<>();

  public ChatRelayHandler(UpstreamProperties props) {
    this.props = props;
  }

  @Override
  public Mono<Void> handle(WebSocketSession vueSession) {
    String sessionId = UUID.randomUUID().toString();
    log.info("Vue WS connected sessionId={}", sessionId);

    // Build upstream URI (token via query param — WebSocket API can't set headers in browsers).
    // HandshakeInfo.getUri() returns java.net.URI which has no getQueryParams(); split raw query.
    String token = extractToken(vueSession.getHandshakeInfo().getUri().getRawQuery());
    String upstreamUrl = props.baseUrl().replaceFirst("^http", "ws")
        + props.wsPath() + "?token=" + token;

    // UpstreamChatClient owns BOTH pump directions; on either-side end it invokes onClose.
    UpstreamChatClient upstream = new UpstreamChatClient(upstreamUrl, vueSession, () -> {
      registry.remove(sessionId);
      if (vueSession.isOpen()) {
        vueSession.close(CloseStatus.GOING_AWAY).subscribe();
      }
    });
    registry.put(sessionId, upstream);

    return upstream.connect()
        .doOnError(err -> {
          log.warn("upstream connect failed sessionId={} err={}", sessionId, err.toString());
          registry.remove(sessionId);
          if (vueSession.isOpen()) {
            try {
              String safeMsg = err.getClass().getSimpleName().replace("\"", "'");
              String frame = String.format(
                  "{\"type\":\"error\",\"code\":\"upstream_unavailable\",\"message\":\"%s\"}",
                  safeMsg);
              vueSession.send(Mono.just(vueSession.textMessage(frame))).subscribe();
              vueSession.close(CloseStatus.SERVER_ERROR).subscribe();
            } catch (Exception ignored) {
              // Best-effort error event; if Vue is already gone there is nothing else to do.
            }
          }
        })
        .doFinally(sig -> {
          registry.remove(sessionId);
          log.info("WS relay sessionId={} finished reason={}", sessionId, sig);
        })
        .then();
  }

  /** Visible for tests. */
  public int activeCount() {
    return registry.size();
  }

  /**
   * Pull {@code token=...} out of a raw URL query string. Tolerant of {@code null},
   * leading {@code ?}, and {@code &}-separated params. Returns empty string when missing.
   */
  static String extractToken(String rawQuery) {
    if (rawQuery == null || rawQuery.isEmpty()) return "";
    for (String pair : rawQuery.split("&")) {
      int eq = pair.indexOf('=');
      if (eq <= 0) continue;
      String key = pair.substring(0, eq);
      if ("token".equals(key)) {
        return java.net.URLDecoder.decode(pair.substring(eq + 1), java.nio.charset.StandardCharsets.UTF_8);
      }
    }
    return "";
  }

  @PreDestroy
  public void shutdown() {
    log.info("PreDestroy: closing {} upstream clients", registry.size());
    registry.forEach((id, c) -> c.close());
    registry.clear();
  }
}
