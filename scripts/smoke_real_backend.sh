#!/usr/bin/env bash
# Phase 3 — Full feature matrix smoke test against real Qwen3-VL backend.
#
# Hits every meaningful endpoint end-to-end and asserts the expected
# status / shape. Runs from Mac via SSH tunnel (localhost:9000 → server).
#
# Exits non-zero on any failure. Logs every step to stderr + writes a
# machine-readable summary to stdout as JSON.

set -uo pipefail

BASE="${BASE:-http://127.0.0.1:9000}"
USER1="alice"
PASS1="alice1234"
USER2="bob"
PASS2="bob12345"
TEST_IMAGE="${TEST_IMAGE:-/tmp/test-red.jpg}"
FAIL=0
PASS=0
RESULTS=()

ok() { RESULTS+=("{\"step\":\"$1\",\"ok\":true}"); PASS=$((PASS+1)); }
nok() { RESULTS+=("{\"step\":\"$1\",\"ok\":false,\"reason\":\"$2\"}"); FAIL=$((FAIL+1)); echo "FAIL: $1 — $2" >&2; }

step() { echo "" >&2; echo "=== $1 ===" >&2; }

step "1. login alice"
TOKEN_JSON=$(curl -sS -X POST "$BASE/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USER1\",\"password\":\"$PASS1\"}")
TOKEN=$(echo "$TOKEN_JSON" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('access_token',''))" 2>/dev/null)
[ -n "$TOKEN" ] && ok "login_alice" || { nok "login_alice" "no access_token"; exit 1; }

step "2. /me with Bearer"
ME=$(curl -sS -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/me")
ME_USER=$(echo "$ME" | python3 -c "import json,sys;print(json.load(sys.stdin).get('username',''))" 2>/dev/null)
[ "$ME_USER" = "alice" ] && ok "me_returns_alice" || nok "me_returns_alice" "got=$ME_USER"

step "3. /me without token → 401"
CODE=$(curl -sS -o /dev/null -w "%{http_code}" "$BASE/api/v1/me")
[ "$CODE" = "401" ] && ok "me_401_no_token" || nok "me_401_no_token" "code=$CODE"

step "4. login with wrong password → 401"
# Schema enforces min_length=8 on password, so "wrong" would 422 first;
# use a wrong-but-valid-length password to actually hit the auth check.
CODE=$(curl -sS -o /dev/null -w "%{http_code}" -X POST "$BASE/api/v1/auth/login" \
  -H "Content-Type: application/json" -d "{\"username\":\"$USER1\",\"password\":\"wrongpassword\"}")
[ "$CODE" = "401" ] && ok "login_wrong_pwd_401" || nok "login_wrong_pwd_401" "code=$CODE"

step "5. refresh token"
REFRESH=$(echo "$TOKEN_JSON" | python3 -c "import json,sys;print(json.load(sys.stdin).get('refresh_token',''))" 2>/dev/null)
NEW_TOKEN=$(curl -sS -X POST "$BASE/api/v1/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refresh_token\":\"$REFRESH\"}" | python3 -c "import json,sys;print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)
[ -n "$NEW_TOKEN" ] && ok "refresh_token" || nok "refresh_token" "no new access_token"

step "6. /agent/invoke 纯文本 (真模型)"
TEXT_REPLY=$(curl -sS --max-time 60 -X POST "$BASE/api/v1/agent/invoke" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"一句话介绍你自己"}]}' \
  | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('reply',''))" 2>/dev/null)
echo "  text reply: $TEXT_REPLY" >&2
[ -n "$TEXT_REPLY" ] && [ "${#TEXT_REPLY}" -gt 10 ] && ok "agent_text" || nok "agent_text" "reply too short or empty"

step "7. /agent/invoke 多模态 (image)"
if [ ! -f "$TEST_IMAGE" ]; then
  python3 -c "
from PIL import Image, ImageDraw
img = Image.new('RGB', (400, 300), color=(220, 50, 50))
d = ImageDraw.Draw(img)
d.rectangle([50, 50, 350, 250], fill=(50, 100, 220))
d.text((80, 130), 'RED', fill='white')
img.save('$TEST_IMAGE', 'JPEG', quality=85)
"
fi
UP=$(curl -sS -X POST "$BASE/api/v1/media/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@$TEST_IMAGE;type=image/jpeg")
MEDIA_URL=$(echo "$UP" | python3 -c "import json,sys;print(json.load(sys.stdin).get('url',''))" 2>/dev/null)
[ -n "$MEDIA_URL" ] && ok "media_upload" || nok "media_upload" "no url"

MM_REPLY=$(curl -sS --max-time 60 -X POST "$BASE/api/v1/agent/invoke" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"messages\":[{\"role\":\"user\",\"content\":[{\"type\":\"text\",\"text\":\"这张图什么颜色？\"},{\"type\":\"image_url\",\"image_url\":{\"url\":\"$MEDIA_URL\"}}]}]}" \
  | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('reply',''))" 2>/dev/null)
echo "  mm reply: $MM_REPLY" >&2
echo "$MM_REPLY" | grep -qE "红|RED" && ok "agent_multimodal_sees_red" || nok "agent_multimodal_sees_red" "reply=$MM_REPLY"

step "8. /agent/invoke tool calling (calculator: 23 * 47)"
TOOL_REPLY=$(curl -sS --max-time 60 -X POST "$BASE/api/v1/agent/invoke" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"计算 23 乘以 47 等于多少？"}]}' \
  | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('reply',''))" 2>/dev/null)
echo "  tool reply: $TOOL_REPLY" >&2
echo "$TOOL_REPLY" | grep -qE "1081|1,081" && ok "agent_calculator_23x47" || nok "agent_calculator_23x47" "reply=$TOOL_REPLY"

step "9. /agent/invoke tool calling (server_info)"
SI_REPLY=$(curl -sS --max-time 60 -X POST "$BASE/api/v1/agent/invoke" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"现在 GPU 显存用了多少？"}]}' \
  | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('reply',''))" 2>/dev/null)
echo "  server_info reply: $SI_REPLY" >&2
echo "$SI_REPLY" | grep -qE "显存|MiB|GiB|A6000" && ok "agent_server_info" || nok "agent_server_info" "reply=$SI_REPLY"

step "10. GET /media/{id} (公开, 无 auth)"
MEDIA_ID=$(echo "$UP" | python3 -c "import json,sys;print(json.load(sys.stdin).get('media_id',''))" 2>/dev/null)
CODE=$(curl -sS -o /dev/null -w "%{http_code}" "$BASE/api/v1/media/$MEDIA_ID")
[ "$CODE" = "200" ] && ok "media_get_public" || nok "media_get_public" "code=$CODE"

step "11. unknown /media → 404"
CODE=$(curl -sS -o /dev/null -w "%{http_code}" "$BASE/api/v1/media/nonexistent")
[ "$CODE" = "404" ] && ok "media_get_404" || nok "media_get_404" "code=$CODE"

step "12. /media/upload wrong mime (.txt) → 415"
echo "not an image" > /tmp/test.txt
CODE=$(curl -sS -o /dev/null -w "%{http_code}" -X POST "$BASE/api/v1/media/upload" \
  -H "Authorization: Bearer $TOKEN" -F "file=@/tmp/test.txt;type=text/plain")
[ "$CODE" = "415" ] && ok "media_upload_wrong_mime_415" || nok "media_upload_wrong_mime_415" "code=$CODE"

step "13. WS 流式"
WS_OUT=$(env -u ALL_PROXY -u all_proxy -u HTTP_PROXY -u http_proxy -u HTTPS_PROXY -u https_proxy python3 -c "
import asyncio, json, sys
try:
    import websockets
except ImportError:
    print('NO_WEBSOCKETS'); sys.exit(0)
async def go():
    async with websockets.connect('ws://127.0.0.1:9000/api/v1/ws/chat') as ws:
        await ws.send(json.dumps({'messages':[{'role':'user','content':'你是谁？一句话'}]}))
        events = []
        for _ in range(60):
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=30)
            except asyncio.TimeoutError:
                break
            ev = json.loads(raw)
            events.append(ev.get('type'))
            if ev.get('type') == 'message.done':
                break
        return events
print(','.join(asyncio.run(go())))
" 2>&1 | tail -1)
echo "  ws events: $WS_OUT" >&2
echo "$WS_OUT" | grep -q "message.start" && echo "$WS_OUT" | grep -q "message.done" && ok "ws_streaming" || nok "ws_streaming" "events=$WS_OUT"

echo ""
echo "{\"passed\":$PASS,\"failed\":$FAIL,\"results\":[$(IFS=,; echo "${RESULTS[*]}")]}"
[ $FAIL -eq 0 ] && exit 0 || exit 1
