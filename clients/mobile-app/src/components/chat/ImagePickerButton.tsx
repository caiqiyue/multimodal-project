/**
 * ImagePickerButton — 📎 button that opens the system image library,
 * uploads each picked asset, and hands the resulting media list back to
 * the chat screen for rendering + WS dispatch.
 *
 * Pure presentational container for `useImagePicker` + `uploadMedia`. The
 * parent decides what to do with the uploaded media (typically: append a
 * user bubble, then send a multi-modal turn via `useChatStream.send`).
 *
 * Loading state covers the whole flow: tapping permission dialog → picking
 * → uploading N files → resolving. We disable the button while busy so the
 * user can't double-fire and trigger overlapping upload streams.
 */
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useImagePicker } from '../../hooks/useImagePicker';
import type { LocalMedia } from '../../hooks/useChatStream';
import { uploadMedia } from '../../lib/upload-media';

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
      const uploaded: LocalMedia[] = [];
      for (const item of picked) {
        try {
          const response = await uploadMedia({
            uri: item.uri,
            name: item.fileName,
            mediaType: item.mediaType,
            fileSize: item.fileSize,
            mimeType: item.mimeType,
          });
          uploaded.push({
            id: nextMediaId(),
            localUri: item.uri,
            uploadedUrl: response.url,
            mediaType: item.mediaType,
            width: item.width,
            height: item.height,
          });
        } catch (err) {
          const message =
            err instanceof Error ? err.message : '上传失败，请重试';
          Alert.alert('上传失败', message);
          // Continue with whatever already uploaded — partial success is
          // better than losing everything.
          break;
        }
      }
      if (uploaded.length > 0) {
        onMediaReady(uploaded);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : '选择文件失败';
      Alert.alert('选择失败', message);
    } finally {
      setIsUploading(false);
    }
  }, [busy, pickMedia, onMediaReady]);

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.btn,
        (disabled || busy) && styles.btnDisabled,
        pressed && !disabled && !busy && styles.btnPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel="选择图片或视频"
      accessibilityState={{ disabled: disabled || busy, busy }}
    >
      <View style={styles.row}>
        {busy ? (
          <ActivityIndicator size="small" color="#374151" />
        ) : (
          <Text style={styles.glyph}>📎</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnPressed: {
    backgroundColor: '#e5e7eb',
  },
  row: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    fontSize: 22,
  },
});
