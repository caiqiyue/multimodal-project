/**
 * Minimal fetch-shaped wrapper around Taro.request.
 *
 * The mini-program's weapp runtime does NOT expose the global `fetch`
 * function — calls like `await fetch(url)` throw "fetch is not a function"
 * (observed in Session 033 when the user opened wechat devtools and
 * tried to login). The H5 runtime DOES have a native fetch, so we use
 * the same wrapper in both — keeps callers platform-agnostic and
 * avoids `if (process.env.TARO_ENV === 'weapp')` branching at call
 * sites.
 *
 * Returns a fetch-like Response with .ok / .status / .json() so existing
 * authFetch / wechatLoginAndAuth code keeps working unchanged.
 */
import Taro from '@tarojs/taro';

interface FetchInit {
  method?: string;
  headers?: Record<string, string>;
  /** Request body — accepted as a plain string (JSON-serialized by caller).
   *  We keep the type wide (BodyInit-shaped) so authFetch's `...rest` of
   *  RequestInit passes through without extra filtering; taroFetch
   *  JSON-serializes anything non-string before handing to Taro.request. */
  body?: unknown;
}

interface FetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
}

export async function taroFetch(
  url: string,
  init?: FetchInit,
): Promise<FetchResponse> {
  const res = await Taro.request({
    url,
    method: (init?.method ?? 'GET') as
      | 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS',
    header: init?.headers,
    data: typeof init?.body === 'string' ? init.body : JSON.stringify(init?.body),
  });
  return {
    ok: res.statusCode >= 200 && res.statusCode < 300,
    status: res.statusCode,
    statusText: String(res.statusCode),
    json: async () => res.data,
  };
}
