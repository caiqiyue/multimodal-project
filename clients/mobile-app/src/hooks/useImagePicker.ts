/**
 * useImagePicker — thin React hook around expo-image-picker.
 *
 * Responsibilities:
 *  - Request media-library permission lazily (only when the user actually
 *    taps the picker button) so the app doesn't pop a permission dialog at
 *    launch.
 *  - Call `launchImageLibraryAsync` with our V1 config (image + video, up to
 *    4 assets).
 *  - Return the picked assets (or null if the user cancelled / denied).
 *
 * Pure client-side size + mime pre-check happens here so the user gets an
 * immediate error before any network round-trip. The actual upload lives
 * in `lib/upload-media.ts` so this hook stays focused on the picker surface.
 */
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useState } from 'react';
import type { MediaType as ContractMediaType } from '@multimodal/api-contract/media';

import { MediaValidationError } from '../lib/upload-media';

export interface PickedMedia {
  uri: string;
  fileName: string;
  mediaType: ContractMediaType;
  fileSize: number;
  mimeType: string;
  width: number;
  height: number;
  durationSeconds: number | null;
}

export interface PickerFailure {
  /** User-friendly error message — safe to render directly in a toast. */
  message: string;
  /** Optional structured code for analytics / branch logic. */
  code?: 'permission_denied' | 'cancelled' | 'too_large' | 'unsupported_mime' | 'unknown';
}

export interface UseImagePickerResult {
  pickMedia: () => Promise<PickedMedia[] | null>;
  isPicking: boolean;
}

function isPickedMedia(asset: ImagePicker.ImagePickerAsset): asset is ImagePicker.ImagePickerAsset & {
  type: 'image' | 'video';
} {
  return asset.type === 'image' || asset.type === 'video';
}

function inferMime(asset: ImagePicker.ImagePickerAsset): string | null {
  if (asset.mimeType !== undefined && asset.mimeType !== null && asset.mimeType.length > 0) {
    return asset.mimeType;
  }
  // Fall back to a sensible default based on the picker asset type.
  if (asset.type === 'image') return 'image/jpeg';
  if (asset.type === 'video') return 'video/mp4';
  return null;
}

export function useImagePicker(options?: { maxSelection?: number }): UseImagePickerResult {
  const maxSelection = options?.maxSelection ?? 4;
  const [isPicking, setIsPicking] = useState(false);

  const pickMedia = useCallback(async (): Promise<PickedMedia[] | null> => {
    setIsPicking(true);
    try {
      // Lazy permission request — only ask the first time the user taps the
      // picker. expo-image-picker handles the "already granted" path as a
      // no-op so calling this on every tap is safe.
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        throw Object.assign(new Error('需要相册权限才能选择图片/视频') as Error, {
          code: 'permission_denied' as const,
        });
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: true,
        selectionLimit: maxSelection,
        quality: 1,
        videoMaxDuration: 30,
      });

      if (result.canceled) return null;
      const assets = result.assets;
      if (!Array.isArray(assets) || assets.length === 0) return null;

      const picked: PickedMedia[] = [];
      for (const asset of assets) {
        if (!isPickedMedia(asset)) continue;
        const mimeType = inferMime(asset);
        if (mimeType === null) continue;
        picked.push({
          uri: asset.uri,
          fileName: asset.fileName ?? `upload-${Date.now()}`,
          mediaType: asset.type,
          fileSize: typeof asset.fileSize === 'number' ? asset.fileSize : 0,
          mimeType,
          width: asset.width,
          height: asset.height,
          durationSeconds:
            typeof asset.duration === 'number' ? asset.duration : null,
        });
      }

      // Trigger client-side pre-check by simulating an uploadMedia call's
      // assertAcceptable. We import MediaValidationError only for the type
      // narrowing — the actual size/mime validation lives in uploadMedia.
      for (const item of picked) {
        if (item.mediaType === 'image' && item.fileSize > 10 * 1024 * 1024) {
          throw new MediaValidationError('too_large', '图片超过 10MB 上限');
        }
        if (item.mediaType === 'video' && item.fileSize > 50 * 1024 * 1024) {
          throw new MediaValidationError('too_large', '视频超过 50MB 上限');
        }
      }
      return picked;
    } catch (err) {
      // Bubble structured failures up to the caller via console for now.
      // The caller (ImagePickerButton) sets the loading state back to false
      // regardless via the finally block below.
      // eslint-disable-next-line no-console
      console.warn('[useImagePicker] failed:', err);
      throw err;
    } finally {
      setIsPicking(false);
    }
  }, [maxSelection]);

  return { pickMedia, isPicking };
}
