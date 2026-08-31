/**
 * MediaPreview — renders one media attachment inside a chat bubble.
 *
 * Two flavours:
 *  - Image: `expo-image` <Image> (caching, blurhash, etc.). Tapping is a
 *    no-op for V1 — the server has the file and the assistant bubble
 *    already shows the model response.
 *  - Video: tap-to-open placeholder. RN core has no built-in <Video>
 *    component and we don't want to pull expo-av just for an inline
 *    preview. Tapping fires `Linking.openURL(uploadedUrl)` so iOS plays
 *    the file in its native QuickLook / AV kit.
 *
 * Sizing: max 200×200 with preserveAspectRatio so big landscape photos
 * don't blow up the bubble. The bubble itself constrains to 85% width
 * (see MessageBubble styles), so we cap height to keep multi-image
 * stacks compact.
 */
import { Image } from 'expo-image';
import { useCallback } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import type { LocalMedia } from '../../hooks/useChatStream';

type Props = {
  media: LocalMedia;
  /** Style of the surrounding bubble — used to pick the foreground tint. */
  variant: 'user' | 'assistant';
};

export function MediaPreview({ media, variant }: Props) {
  const handlePress = useCallback(() => {
    // Native Linking — works on iOS without extra deps; opens the file in
    // QuickLook / the system video player.
    Linking.openURL(media.uploadedUrl).catch(() => undefined);
  }, [media.uploadedUrl]);

  if (media.mediaType === 'image') {
    return (
      <Image
        source={{ uri: media.localUri }}
        style={styles.image}
        contentFit="cover"
        transition={120}
        accessibilityLabel="用户上传的图片"
      />
    );
  }

  // Video placeholder — small thumbnail area + play affordance.
  const fg = variant === 'user' ? '#fff' : '#374151';
  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.videoBox, pressed && styles.videoPressed]}
      accessibilityRole="button"
      accessibilityLabel={`视频附件，点击播放 ${formatDimensions(media.width, media.height)}`}
    >
      <View style={styles.playBadge}>
        <Text style={styles.playGlyph}>▶</Text>
      </View>
      <Text style={[styles.videoCaption, { color: fg }]}>视频 · 点击播放</Text>
    </Pressable>
  );
}

function formatDimensions(w: number, h: number): string {
  if (w <= 0 || h <= 0) return '';
  return `${Math.round(w)}×${Math.round(h)}`;
}

const styles = StyleSheet.create({
  image: {
    width: 200,
    height: 200,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
  },
  videoBox: {
    width: 200,
    height: 120,
    borderRadius: 8,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPressed: {
    opacity: 0.8,
  },
  playBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  playGlyph: {
    fontSize: 22,
    color: '#111827',
    marginLeft: 3, // visually centre the triangle
  },
  videoCaption: {
    fontSize: 12,
    opacity: 0.85,
  },
});
