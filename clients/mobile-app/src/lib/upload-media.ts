/**
 * uploadMedia — POST /api/v1/media/upload (feat-020 backend).
 *
 * Wraps the multipart upload flow:
 *  1. Pre-check size against MEDIA_LIMITS (image <= 10 MB / video <= 50 MB)
 *     so the user gets an immediate error instead of waiting for the wire
 *     to finish a 413 round-trip (V1 limitation: 413 fires after full body
 *     read — see session-handoff.md).
 *  2. Build a multipart/form-data body manually via XMLHttpRequest (NOT fetch).
 *  3. Explicitly attach `Authorization: Bearer <token>` from SecureStore.
 *  4. Return the parsed MediaUploadResponse.
 *
 * ── Why XMLHttpRequest instead of fetch ────────────────────────────────────
 * iOS NSURLSession (which backs React Native's `fetch` with
 * `EXPO_PUBLIC_USE_RN_FETCH=1`) silently drops the `Authorization` request
 * header when the request body is `multipart/form-data`. Confirmed in
 * Session 034: debug log shows the token is present in SecureStore and is
 * being read (`token.len=172 token.prefix=eyJhbGciOiJI`), yet the same
 * request via curl with the same token returns the expected 415
 * (auth-passed, MIME-rejected) while the mobile-app returns 401
 * (auth-failed).
 *
 * XHR goes through a different code path on iOS and does forward
 * Authorization headers on multipart POSTs. This is the canonical RN
 * upload pattern; see expo / react-native docs and the long-standing
 * community guidance to use XHR for multipart uploads.
 *
 * The picker asset's `uri` is a local file:// path on iOS / Android. XHR's
 * FormData streams the file contents into the multipart body — we don't
 * have to read the file into memory.
 */
import { MEDIA_LIMITS, type MediaUploadResponse, type MediaType } from '@multimodal/api-contract/media';

import { getAccessToken } from './tokenStorage';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';

/**
 * A file picked from expo-image-picker that we want to upload.
 *
 * We intentionally type the surface we care about rather than importing the
 * full ImagePickerAsset — keeps this module usable from any caller without
 * pulling in expo-image-picker types here.
 */
export interface UploadableAsset {
  uri: string;
  /** Display name; falls back to a UUID if the picker didn't return one. */
  name?: string;
  /** Image or video. Picker asset.type is 'image' | 'video'. */
  mediaType: MediaType;
  /** Bytes (if known) — used for client-side pre-check. */
  fileSize?: number;
  /** Mime string (if known) — used for client-side mime check. */
  mimeType?: string;
}

export class MediaValidationError extends Error {
  readonly code: 'too_large' | 'unsupported_mime';
  constructor(code: 'too_large' | 'unsupported_mime', message: string) {
    super(message);
    this.code = code;
    this.name = 'MediaValidationError';
  }
}

function assertAcceptable(asset: UploadableAsset): void {
  const sizeCap =
    asset.mediaType === 'image' ? MEDIA_LIMITS.maxImageBytes : MEDIA_LIMITS.maxVideoBytes;
  if (asset.fileSize !== undefined && asset.fileSize > sizeCap) {
    const mb = (sizeCap / (1024 * 1024)).toFixed(0);
    const kind = asset.mediaType === 'image' ? '图片' : '视频';
    throw new MediaValidationError(
      'too_large',
      `${kind}超过 ${mb}MB 上限（已选 ${(asset.fileSize / (1024 * 1024)).toFixed(1)}MB）`,
    );
  }
  const allowedMimes =
    asset.mediaType === 'image'
      ? MEDIA_LIMITS.acceptedImageMimes
      : MEDIA_LIMITS.acceptedVideoMimes;
  if (asset.mimeType !== undefined && !allowedMimes.includes(asset.mimeType as never)) {
    throw new MediaValidationError(
      'unsupported_mime',
      `不支持的文件类型: ${asset.mimeType}（允许: ${allowedMimes.join(', ')}）`,
    );
  }
}

function defaultFileName(asset: UploadableAsset): string {
  if (asset.name !== undefined && asset.name.length > 0) return asset.name;
  const ext =
    asset.mediaType === 'image'
      ? asset.mimeType?.endsWith('png')
        ? '.png'
        : asset.mimeType?.endsWith('webp')
          ? '.webp'
          : '.jpg'
      : '.mp4';
  return `upload-${Date.now()}${ext}`;
}

function defaultMime(asset: UploadableAsset): string {
  if (asset.mimeType !== undefined && asset.mimeType.length > 0) return asset.mimeType;
  return asset.mediaType === 'image' ? 'image/jpeg' : 'video/mp4';
}

/**
 * Upload a single asset to the server. Throws MediaValidationError on
 * pre-check failure, or an Error whose message contains the HTTP status
 * on a non-2xx response (so the chat UI can surface a meaningful error).
 *
 * Implementation uses XMLHttpRequest directly — see the file header for
 * why fetch is not used here.
 */
export async function uploadMedia(asset: UploadableAsset): Promise<MediaUploadResponse> {
  assertAcceptable(asset);

  const formData = new FormData();
  // React Native FormData accepts { uri, name, type } as a file part.
  formData.append('file', {
    // The cast through `unknown` is because RN's FormData file part shape is
    // structurally compatible but its types come from RN core, not DOM lib.
    uri: asset.uri,
    name: defaultFileName(asset),
    type: defaultMime(asset),
  } as unknown as Blob);

  const token = await getAccessToken();
  if (token === null || token.length === 0) {
    throw new Error('Unauthorized (no access token in storage)');
  }

  const url = `${API_BASE_URL}/media/upload`;

  return new Promise<MediaUploadResponse>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    // Do NOT set Content-Type — XHR + FormData will set the multipart
    // boundary itself, and a hand-set header would clobber the boundary.
    xhr.responseType = 'json';
    xhr.onload = (): void => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response as MediaUploadResponse);
        return;
      }
      // Surface the HTTP status in the error so the UI can show "上传失败 (401)"
      // rather than the generic "Network Error".
      const body =
        typeof xhr.response === 'object' && xhr.response !== null && 'error' in xhr.response
          ? String((xhr.response as { error?: unknown }).error)
          : '';
      reject(new Error(`Upload failed (${xhr.status})${body ? `: ${body}` : ''}`));
    };
    xhr.onerror = (): void => {
      reject(new Error('Network error during upload'));
    };
    xhr.send(formData);
  });
}
