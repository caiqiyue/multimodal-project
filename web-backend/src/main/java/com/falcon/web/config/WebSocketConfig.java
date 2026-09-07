package com.falcon.web.config;

import com.falcon.web.ws.ChatRelayHandler;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.reactive.HandlerMapping;
import org.springframework.web.reactive.handler.SimpleUrlHandlerMapping;
import org.springframework.web.reactive.socket.WebSocketHandler;
import org.springframework.web.reactive.socket.server.support.WebSocketHandlerAdapter;

import java.util.Map;

/**
 * Registers {@link ChatRelayHandler} at {@code /api/web/ws/chat}.
 * <p>
 * Uses {@link SimpleUrlHandlerMapping} with order {@code -1} so the WS endpoint wins over
 * any later (default order) {@code @RequestMapping} mapping that might otherwise match
 * the path as a regular HTTP route.
 */
@Configuration
public class WebSocketConfig {

  @Bean
  public HandlerMapping wsHandlerMapping(ChatRelayHandler chatRelayHandler) {
    SimpleUrlHandlerMapping mapping = new SimpleUrlHandlerMapping();
    mapping.setUrlMap(Map.of("/api/web/ws/chat", (WebSocketHandler) chatRelayHandler));
    mapping.setOrder(-1);
    return mapping;
  }

  @Bean
  public WebSocketHandlerAdapter handlerAdapter() {
    return new WebSocketHandlerAdapter();
  }
}
