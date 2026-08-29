import { z } from 'zod';

const int = () => z.number().int().nonnegative();
const number = () => z.number();

export const MediaTypeSchema = z.enum(['image', 'video']);
export type MediaType = z.infer<typeof MediaTypeSchema>;

// Note: multipart upload request body is NOT validated by Zod
// (browser handles FormData). This contract only documents the
// wire-level shape and the response schema so client + server agree.

// Server-enforced limits (per CLAUDE.md §3.3 hard constraint).
export const MEDIA_LIMITS = {
  maxImageBytes: 10 * 1024 * 1024,
  maxVideoBytes: 50 * 1024 * 1024,
  maxVideoSeconds: 30,
  acceptedImageMimes: ['image/jpeg', 'image/png', 'image/webp'],
  acceptedVideoMimes: ['video/mp4'],
} as const;

export const MediaUploadRequestSchema = z.object({
  // Multipart form-data field name. Always 'file'.
  fieldName: z.literal('file'),
});
export type MediaUploadRequest = z.infer<typeof MediaUploadRequestSchema>;

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
