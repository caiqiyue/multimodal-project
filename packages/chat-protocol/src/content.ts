export type TextContentBlock = { type: 'text'; text: string };
export type ImageUrlContentBlock = { type: 'image_url'; image_url: { url: string } };
export type VideoUrlContentBlock = { type: 'video_url'; video_url: { url: string } };

export type AssistantContentBlock = TextContentBlock;

export type ContentBlock =
  | TextContentBlock
  | ImageUrlContentBlock
  | VideoUrlContentBlock;
