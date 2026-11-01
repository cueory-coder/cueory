/**
 * Serves lesson 1's "label it" set as a static JSON file. The page fetches it after it loads, so no label text is ever
 * in the page's HTML or in Astro's island props (Codex review of #71).
 */
import type { APIRoute } from 'astro';
import { getEntry } from 'astro:content';
import { parseSet } from '../../../../islands/labelit';

export const GET = (async () => {
  const entry = await getEntry('label-it', 'study-skills-01');
  if (!entry) throw new Error('Label it file content/label-it/study-skills-01.json is missing.');
  const set = parseSet({ id: entry.id, image: entry.data.image, labels: entry.data.labels });
  return new Response(JSON.stringify(set), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}) satisfies APIRoute;
