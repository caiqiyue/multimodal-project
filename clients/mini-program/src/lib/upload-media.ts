/**
 * uploadMedia — POST /api/v1/media/upload (feat-020 backend).
 *
 * Taro 4 flavor: uses `Taro.uploadFile` instead of RN FormData. Taro's H5
 * shim wraps `<input type="file">` FormData; weapp delegates to
 * `wx.uploadFile` which natively understands `filePath` for multipart upload.
 *
 * Wire shape:
 *  1. Pre-check size against MEDIA_LIMITS (image <= 10 MB / video <= 50 MB)
 *     so the user gets an immediate error instead of waiting for the wire
 *     to finish a 413 round-trip (V1 limitation: 413 fires after full body
 *     read — see session-handoff.md).
 *  2. Build upload opts with picker file's tempFilePath as the file part.
 *  3. Send via Taro.uploadFile with bearer JWT in header.
 *  4. Return the parsed MediaUploadResponse.
 *
 * Mirror of `clients/mobile-app/src/lib/upload-media.ts` (Session 024).
 */
import Taro from '@tarojs/taro';
import {
  MEDIA_LIMITS,
  type MediaUploadResponse,
  type MediaType,
} from '@multimodal/api-contract';

const API_BASE_URL = process.env.TARO_APP_API_BASE_URL ?? '';

/**
 * A file picked from Taro.chooseMedia that we want to upload. Surface kept
 * narrow so callers can pass the picker result straight in without
 * depending on Taro types here.
 */
export interface UploadableAsset {
  /** Local temp file path from Taro.chooseMedia (filePath / tempFilePath). */
  tempFilePath: string;
  /** Image or video — Taro reports via ChooseMedia.fileType. */
  mediaType: MediaType;
  /** Bytes (Taro reports via ChooseMedia.size). */
  size?: number;
  /** Optional mime hint — Taro doesn't always report; we default below. */
  mimeType?: string;
  /** Optional filename override. */
  fileName?: string;
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
    asset.mediaType === 'image'
      ? MEDIA_LIMITS.maxImageBytes
      : MEDIA_LIMITS.maxVideoBytes;
  if (asset.size !== undefined && asset.size > sizeCap) {
    const mb = (sizeCap / (1024 * 1024)).toFixed(0);
    const kind = asset.mediaType === 'image' ? '图片' : '视频';
    throw new MediaValidationError(
      'too_large',
      `${kind}超过 ${mb}MB 上限（已选 ${(asset.size / (1024 * 1024)).toFixed(1)}MB）`,
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
  if (asset.fileName !== undefined && asset.fileName.length > 0) return asset.fileName;
  const ext = asset.mediaType === 'image' ? '.jpg' : '.mp4';
  return `upload-${Date.now()}${ext}`;
}

/**
 * Get a bearer token for the upload. Taro doesn't expose a shared
 * tokenStorage helper on this side; the caller passes it in (see the
 * ImagePickerButton — it pulls from `getAccessToken()`).
 */
export interface UploadMediaOptions {
  bearerToken: string;
}

/**
 * Upload a single asset to the server. Throws MediaValidationError on
 * pre-check failure or whatever Taro.uploadFile surfaces on HTTP error.
 */
export async function uploadMedia(
  asset: UploadableAsset,
  options: UploadMediaOptions,
): Promise<MediaUploadResponse> {
  assertAcceptable(asset);
  const result = await Taro.uploadFile({
    url: `${API_BASE_URL}/media/upload`,
    filePath: asset.tempFilePath,
    name: 'file',
    fileName: defaultFileName(asset),
    header: {
      Authorization: `Bearer ${options.bearerToken}`,
    },
    // Taro's H5 shim sets the multipart Content-Type + boundary itself
    // when the body is multipart; passing no `formData` keeps the payload
    // to just the file part, matching the mobile-app upload.
  });
  if (result.statusCode >= 400) {
    throw new Error(`Upload failed: ${result.statusCode}`);
  }
  // Taro.uploadFile returns `data` as a JSON-encoded string.
  return JSON.parse(result.data) as MediaUploadResponse;
}
