import { z } from 'astro/zod';

/**
 * Lesson video file rules (D-82). Kept out of content.config.ts so unit tests can import it.
 * - videoId: exactly 11 URL-safe characters, so it can never change the embed address (no "..", no "/").
 * - captionsUrl / transcriptUrl: an https address or a path on this site, never javascript: or data:.
 * - thumbnail: a path on this site (self-hosted, D-40), never another host.
 */
export const videoId = z.string().regex(/^[A-Za-z0-9_-]{11}$/, 'a YouTube video id is exactly 11 letters, digits, - or _');

const linkOrPath = z
  .string()
  .regex(/^(https:\/\/[^\s/]\S*|\/(?!\/)[^\s\\]*)$/, 'must be an https address or a path on this site starting with /');

export const videoSchema = z.object({
  lesson: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1).max(120),
  status: z.enum(['placeholder', 'draft', 'in_review', 'published']),
  videoId,
  captionsUrl: linkOrPath.or(z.literal('')),
  transcriptUrl: linkOrPath.or(z.literal('')),
  thumbnail: z
    .string()
    .regex(/^\/(?!\/)[A-Za-z0-9._\-/]+\.(png|jpe?g|webp|avif|svg)$/, 'a self-hosted image path starting with /')
    .refine((p) => !p.split('/').includes('..'), 'no ".." in the path')
    .optional(),
});

/** Only published videos may show on a page. */
export const isShowable = (status: string): boolean => status === 'published';
