/**
 * ImagePickerButton — 📎 button that opens Taro.chooseMedia, uploads each
 * picked asset, and hands the resulting media list back to the chat screen
 * for rendering + WS dispatch.
 *
 * Container for `useImagePicker` + `uploadMedia`. The parent decides what
 * to do with the uploaded media (typically: append a user bubble, then
 * send a multi-modal turn via `useChatStream.send`).
 *
 * Loading state covers the whole flow: picker → upload N files → resolve.
 * We disable the button while busy so the user can't double-fire.
 */
import { useCallback, useState } from 'react';
import { Button, View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';

import { useImagePicker } from '../../hooks/useImagePicker';
import type { LocalMedia } from '../../hooks/useChatStream';
import { uploadMedia } from '../../lib/upload-media';
import { getAccessToken } from '../../lib/tokenStorage';

import '../chat/chat.scss';

type Props = {
  /** Called with each successfully uploaded media + the current caption. */
  onMediaReady: (media: LocalMedia[]) => void;
  /** Disable the button (e.g. WS disconnected). */
  disabled?: boolean;
};

let counter = 0;
function nextMediaId(): string {
  counter += 1;
  return `m-${counter}`;
}

export function ImagePickerButton({ onMediaReady, disabled = false }: Props) {
  const { pickMedia, isPicking } = useImagePicker({ maxSelection: 4 });
  const [isUploading, setIsUploading] = useState(false);
  const busy = isPicking || isUploading;

  const handlePress = useCallback(async () => {
    if (busy) return;
    try {
      const picked = await pickMedia();
      if (picked === null || picked.length === 0) return;

      setIsUploading(true);
      const bearer = await getAccessToken();
      if (bearer === null || bearer.length === 0) {
        Taro.showToast({ title: '请先登录', icon: 'none' });
        return;
      }

      const uploaded: LocalMedia[] = [];
      for (const item of picked) {
        try {
          const response = await uploadMedia(
            {
              tempFilePath: item.tempFilePath,
              mediaType: item.mediaType,
              size: item.size,
              mimeType: item.mimeType,
              fileName: item.fileName,
            },
            { bearerToken: bearer },
          );
          uploaded.push({
            id: nextMediaId(),
            localUri: item.tempFilePath,
            uploadedUrl: response.url,
            mediaType: item.mediaType,
            width: item.width,
            height: item.height,
          });
        } catch (err) {
          const message =
            err instanceof Error ? err.message : '上传失败，请重试';
          Taro.showToast({ title: message, icon: 'none' });
          // Partial success is better than losing everything.
          break;
        }
      }
      if (uploaded.length > 0) {
        onMediaReady(uploaded);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '选择文件失败';
      Taro.showToast({ title: message, icon: 'none' });
    } finally {
      setIsUploading(false);
    }
  }, [busy, pickMedia, onMediaReady]);

  return (
    <Button
      className='chat-input-row__picker'
      onClick={handlePress}
      disabled={disabled || busy}
      size='mini'
      aria-label='选择图片或视频'
    >
      <View className='chat-input-row__picker-row'>
        {busy ? (
          <Text className='chat-input-row__picker-loading'>···</Text>
        ) : (
          <Text className='chat-input-row__picker-glyph'>📎</Text>
        )}
      </View>
    </Button>
  );
}
