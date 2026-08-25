export const TEST_MEDIA_URLS = {
  catImage: 'https://placekitten.com/300/200',
  cityImage: 'https://picsum.photos/seed/city/400/300',
  abstractImage: 'https://picsum.photos/seed/abstract/400/300',
  videoFrame: 'https://picsum.photos/seed/videoframe/640/360',
} as const;

/**
 * Mock media IDs and their URLs. When MSW receives GET /api/v1/media/:id,
 * it returns the matching URL.
 */
export const TEST_MEDIA: Record<string, { url: string; media_type: 'image' | 'video' }> = {
  media_cat: { url: TEST_MEDIA_URLS.catImage, media_type: 'image' },
  media_city: { url: TEST_MEDIA_URLS.cityImage, media_type: 'image' },
  media_abstract: { url: TEST_MEDIA_URLS.abstractImage, media_type: 'image' },
  media_video_1: { url: TEST_MEDIA_URLS.videoFrame, media_type: 'video' },
};
