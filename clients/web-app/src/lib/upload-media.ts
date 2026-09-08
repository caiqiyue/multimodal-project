/**
 * uploadMedia — POST /api/web/media/upload via fetch (browser has no
 * iOS NSURLSession multipart bug — RN did). Pre-checks size + mime
 * against MEDIA_LIMITS before any network call.
 */
import { MEDIA_LIMITS, type MediaUploadResponse, type MediaType } from '@multimodal/api-contract/media';
import { getAccessToken } from './tokenStorage';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8080';

export class MediaValidationError extends Error {
  readonly code: 'too_large' | 'unsupported_mime';
  constructor(code: 'too_large' | 'unsupported_mime', message: string) {
    super(message);
    this.code = code;
    this.name = 'MediaValidationError';
  }
}

export interface UploadableAsset {
  file: File;
  mediaType: MediaType;
}

function assertAcceptable(asset: UploadableAsset): void {
  const sizeCap =
    asset.mediaType === 'image' ? MEDIA_LIMITS.maxImageBytes : MEDIA_LIMITS.maxVideoBytes;
  if (asset.file.size > sizeCap) {
    const mb = (sizeCap / 1024 / 1024).toFixed(0);
    const kind = asset.mediaType === 'image' ? '图片' : '视频';
    throw new MediaValidationError('too_large', `${kind}超过 ${mb}MB 上限`);
  }
  const allowed =
    asset.mediaType === 'image'
      ? MEDIA_LIMITS.acceptedImageMimes
      : MEDIA_LIMITS.acceptedVideoMimes;
  if (!allowed.includes(asset.file.type as never)) {
    throw new MediaValidationError('unsupported_mime', `不支持: ${asset.file.type}`);
  }
}

export async function uploadMedia(asset: UploadableAsset): Promise<MediaUploadResponse> {
  assertAcceptable(asset);
  const token = getAccessToken();
  const formData = new FormData();
  formData.append('file', asset.file, asset.file.name);
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const response = await fetch(`${BASE_URL}/api/web/media/upload`, {
    method: 'POST',
    headers,
    body: formData,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { detail?: string };
    throw new Error(
      `Upload failed (${response.status})${body.detail ? `: ${body.detail}` : ''}`,
    );
  }
  return (await response.json()) as MediaUploadResponse;
}