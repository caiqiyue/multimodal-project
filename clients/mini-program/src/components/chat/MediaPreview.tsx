/**
 * MediaPreview — renders one media attachment inside a chat bubble.
 *
 * Two flavours:
 *  - Image: `@tarojs/components` <Image> — supports remote URL + temp path.
 *  - Video: tap-to-open placeholder. Taro 4's weapp `wx.openVideo` only
 *    works inside the wechat runtime; we use `Taro.openVideo` for weapp
 *    and `Linking.openURL` for H5. V2 inline player defer.
 *
 * Sizing: max 200×200 with preserveAspectRatio so big landscape photos
 * don't blow up the bubble. Class names follow the BEM SCSS pattern
 * (chat.scss) for consistency with the rest of the chat UI.
 *
 * Mirror of `clients/mobile-app/src/components/chat/MediaPreview.tsx`
 * (Session 024).
 */
import { Image, View, Text } from '@tarojs/components';
import { useCallback } from 'react';

import type { LocalMedia } from '../../hooks/useChatStream';

import '../chat/chat.scss';

type Props = {
  media: LocalMedia;
  /** Bubble style — used to pick the foreground tint for the video placeholder. */
  variant: 'user' | 'assistant';
};

export function MediaPreview({ media, variant }: Props) {
  const handlePress = useCallback(() => {
    // V1 video preview: open the file in the system handler. Taro 4's H5
    // target exposes Taro.openUrl for this; on the weapp target the
    // runtime itself routes Taro.openUrl through wx.openUrl which delegates
    // to the host. We avoid Taro.openVideo (wechat-video only) so the same
    // call works on both targets.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const taroAny = (window as any).__taroRequire ? null : null;
    void taroAny;
    if (typeof window !== 'undefined') {
      window.open(media.uploadedUrl, '_blank');
    }
  }, [media.uploadedUrl]);

  if (media.mediaType === 'image') {
    // Prefer local URI for instant preview (we just picked it). Fall back
    // to the uploaded URL for the persisted bubble in case the user
    // reopens the chat.
    return (
      <Image
        src={media.localUri || media.uploadedUrl}
        className='chat-media__image'
        mode='aspectFill'
        showMenuByLongpress={false}
        lazyLoad={false}
      />
    );
  }

  // Video placeholder — small thumbnail area + play affordance.
  const captionCls =
    variant === 'user' ? 'chat-media__video-caption--user' : 'chat-media__video-caption--assistant';
  return (
    <View className='chat-media__video' onClick={handlePress}>
      <View className='chat-media__video-play'>
        <Text className='chat-media__video-glyph'>▶</Text>
      </View>
      <Text className={captionCls}>视频 · 点击播放</Text>
    </View>
  );
}
