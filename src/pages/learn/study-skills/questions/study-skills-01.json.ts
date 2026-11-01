/**
 * Serves lesson 1's sample questions as a static JSON file. The page fetches it after it loads, so the sample keys and
 * rationales are never in the page's HTML or Astro's island props. Only items marked "sample" can be here (D-33): real
 * questions are checked by the database's check_answer from Task 2, and their keys never reach the browser.
 */
import type { APIRoute } from 'astro';
import { getEntry } from 'astro:content';
import { sampleChecker, type SampleItem } from '../../../../islands/questions';

export const GET = (async () => {
  const entry = await getEntry('questions', 'study-skills-01');
  if (!entry) throw new Error('Questions file content/questions/study-skills-01.json is missing.');
  const items = entry.data.items as SampleItem[];
  sampleChecker(items); // throws on anything that isn't a valid sample
  return new Response(JSON.stringify({ status: 'sample', items }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}) satisfies APIRoute;
