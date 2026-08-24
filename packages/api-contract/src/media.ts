import { z } from 'zod';

const int = () => z.number().int().nonnegative();
const number = () => z.number();

export const MediaTypeSchema = z.enum(['image', 'video']);
export type MediaType = z.infer<typeof MediaTypeSchema>;

// Note: multipart upload is NOT validated by Zod schema
// (browser handles FormData). This is the response schema.

export const MediaUploadResponseSchema = z.object({
  media_id: z.string(),
  url: z.string().url(),
  media_type: MediaTypeSchema,
  size_bytes: int(),
  width: int().optional(),
  height: int().optional(),
  duration_seconds: number().optional(),
});
export type MediaUploadResponse = z.infer<typeof MediaUploadResponseSchema>;
