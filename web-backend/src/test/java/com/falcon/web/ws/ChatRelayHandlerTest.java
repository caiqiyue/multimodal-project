package com.falcon.web.ws;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * Pure unit tests for {@link ChatRelayHandler#extractToken(String)}.
 * <p>
 * Why unit (not integration)? The full WS relay path requires a live Vue WS client
 * to drive frames through {@link ChatRelayHandler} into a fake upstream
 * {@link com.falcon.web.ws.UpstreamChatClient}, which in turn requires
 * {@link org.springframework.web.reactive.socket.client.ReactorNettyWebSocketClient}
 * to bind a port and complete a real WS upgrade. That machinery is exercised
 * end-to-end in Task 8 (feat-167 acceptance) with the live Node WS smoke harness;
 * here we focus on the cheap, branch-coverage-friendly unit tests for the query
 * parser that turns the Vue handshake URI into the upstream URI.
 */
class ChatRelayHandlerTest {

  @Test
  @DisplayName("extractToken: null query returns empty string")
  void extractToken_null() {
    assertEquals("", ChatRelayHandler.extractToken(null));
  }

  @Test
  @DisplayName("extractToken: empty query returns empty string")
  void extractToken_empty() {
    assertEquals("", ChatRelayHandler.extractToken(""));
  }

  @Test
  @DisplayName("extractToken: query without token= returns empty string")
  void extractToken_noToken() {
    assertEquals("", ChatRelayHandler.extractToken("foo=bar&baz=qux"));
  }

  @Test
  @DisplayName("extractToken: token only returns decoded JWT")
  void extractToken_tokenOnly() {
    assertEquals("abc.jwt.value", ChatRelayHandler.extractToken("token=abc.jwt.value"));
  }

  @Test
  @DisplayName("extractToken: token with other params picks the right one")
  void extractToken_tokenWithOthers() {
    assertEquals("abc.jwt.value",
        ChatRelayHandler.extractToken("session=xyz&token=abc.jwt.value&other=foo"));
  }

  @Test
  @DisplayName("extractToken: token first followed by other params")
  void extractToken_tokenFirst() {
    assertEquals("abc.jwt.value",
        ChatRelayHandler.extractToken("token=abc.jwt.value&session=xyz"));
  }

  @Test
  @DisplayName("extractToken: URL-encoded token is decoded")
  void extractToken_urlEncoded() {
    // "abc.jwt+value" URL-encoded is "abc.jwt%2Bvalue"
    assertEquals("abc.jwt+value",
        ChatRelayHandler.extractToken("token=abc.jwt%2Bvalue"));
  }

  @Test
  @DisplayName("extractToken: param without '=' is ignored")
  void extractToken_malformedPair() {
    assertEquals("", ChatRelayHandler.extractToken("oops"));
  }

  @Test
  @DisplayName("extractToken: param that starts with '=' is ignored (eq <= 0)")
  void extractToken_eqAtStart() {
    assertEquals("", ChatRelayHandler.extractToken("=noKey"));
  }

  @Test
  @DisplayName("extractToken: empty token value is returned as empty string")
  void extractToken_emptyValue() {
    // "token=" has eq == 6 (>0), so the key check passes; value is "" which
    // decodes to "". This documents current behavior: an empty token is not
    // treated as missing.
    assertEquals("", ChatRelayHandler.extractToken("token="));
    assertNotNull(ChatRelayHandler.extractToken("token="));
  }
}