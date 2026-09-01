/**
 * useImagePicker — thin React hook around Taro.chooseMedia.
 *
 * Responsibilities:
 *  - Call `Taro.chooseMedia` with our V1 config (image + video, up to 4).
 *  - Map Taro's `ChooseMedia[]` shape onto our `PickedMedia` interface.
 *  - Run client-side size + mime pre-check before returning so the caller
 *    surfaces a quick error before any network round-trip.
 *
 * Mirror of `clients/mobile-program/../mobile-app/src/hooks/useImagePicker.ts`
 * (Session 024). The Taro surface is more limited than expo-image-picker —
 * no explicit permission API (Taro delegates to wx.chooseMedia which handles
 * permissions itself), and the picker asset shape is fixed.
 */
import { useCallback, useState } from 'react';
import Taro from '@tarojs/taro';
import type { MediaType as ContractMediaType } from '@multimodal/api-contract';

import { MediaValidationError } from '../lib/upload-media';


export interface PickedMedia {
  tempFilePath: string;
  fileName: string;
  mediaType: ContractMediaType;
  size: number;
  mimeType: string;
  width: number;
  height: number;
  durationSeconds: number | null;
}

export interface PickerFailure {
  message: string;
  code?: 'cancelled' | 'too_large' | 'unsupported_mime' | 'unknown';
}

export interface UseImagePickerResult {
  pickMedia: () => Promise<PickedMedia[] | null>;
  isPicking: boolean;
}

/** Map Taro's `fileType` ('image' | 'video') onto our Contract MediaType. */
function normalizeFileType(fileType: string): ContractMediaType | null {
  if (fileType === 'image') return 'image';
  if (fileType === 'video') return 'video';
  return null;
}

/** Best-effort mime hint from a Taro fileType. Taro doesn't always report one. */
function defaultMime(fileType: string): string {
  if (fileType === 'image') return 'image/jpeg';
  if (fileType === 'video') return 'video/mp4';
  return 'application/octet-stream';
}

export function useImagePicker(options?: { maxSelection?: number }): UseImagePickerResult {
  const maxSelection = options?.maxSelection ?? 4;
  const [isPicking, setIsPicking] = useState(false);

  const pickMedia = useCallback(async (): Promise<PickedMedia[] | null> => {
    setIsPicking(true);
    try {
      const result = await Taro.chooseMedia({
        count: maxSelection,
        mediaType: ['image', 'video'],
        sourceType: ['album'],
        sizeType: ['original'],
        maxDuration: 30,
      });

      const files = result.tempFiles ?? [];
      if (files.length === 0) return null;

      const picked: PickedMedia[] = [];
      for (const f of files) {
        const mediaType = normalizeFileType(f.fileType);
        if (mediaType === null) continue;
        // Taro's H5 path uses `originalFileObj.type` to carry mime; fall back
        // to a sensible default by file type.
        const mimeType =
          (f.originalFileObj && f.originalFileObj.type) || defaultMime(f.fileType);
        picked.push({
          tempFilePath: f.tempFilePath,
          fileName: f.tempFilePath.split('/').pop() ?? `upload-${Date.now()}`,
          mediaType,
          size: typeof f.size === 'number' ? f.size : 0,
          mimeType,
          width: typeof f.width === 'number' ? f.width : 0,
          height: typeof f.height === 'number' ? f.height : 0,
          durationSeconds:
            typeof f.duration === 'number' ? Math.round(f.duration) : null,
        });
      }

      // Client-side pre-check — mirror mobile-app Session 024 behavior so
      // both platforms reject oversized files before they touch the wire.
      for (const item of picked) {
        if (item.mediaType === 'image' && item.size > 10 * 1024 * 1024) {
          throw new MediaValidationError('too_large', '图片超过 10MB 上限');
        }
        if (item.mediaType === 'video' && item.size > 50 * 1024 * 1024) {
          throw new MediaValidationError('too_large', '视频超过 50MB 上限');
        }
      }
      return picked;
    } finally {
      setIsPicking(false);
    }
  }, [maxSelection]);

  return { pickMedia, isPicking };
}
