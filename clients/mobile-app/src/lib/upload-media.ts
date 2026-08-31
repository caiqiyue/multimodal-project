/**
 * uploadMedia — POST /api/v1/media/upload (feat-020 backend).
 *
 * Wraps the multipart upload flow:
 *  1. Pre-check size against MEDIA_LIMITS (image <= 10 MB / video <= 50 MB)
 *     so the user gets an immediate error instead of waiting for the wire
 *     to finish a 413 round-trip (V1 limitation: 413 fires after full body
 *     read — see session-handoff.md).
 *  2. Build FormData with the picker asset URI as the file part.
 *  3. Send via authFetch (auto-attaches bearer JWT).
 *  4. Return the parsed MediaUploadResponse.
 *
 * The picker asset's `uri` is a local file:// path on iOS / Android. React
 * Native's FormData implementation streams the file contents into the
 * multipart body — we don't have to read the file into memory.
 */
import { MEDIA_LIMITS, type MediaUploadResponse, type MediaType } from '@multimodal/api-contract/media';

import { authFetch } from './api';

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
 * pre-check failure or whatever authFetch throws on HTTP error.
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

  return authFetch<MediaUploadResponse>('/media/upload', {
    method: 'POST',
    body: formData,
    // Let RN set the multipart Content-Type + boundary itself.
    headers: {},
  });
}
