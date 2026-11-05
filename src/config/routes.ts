/**
 * Pages that may be listed in the public sitemap. Noindex and preview pages stay out. Lesson pages generated from
 * /content are added to the sitemap at build time (src/pages/sitemap.xml.ts, Task 300); study-skills is listed here too.
 */
export const indexablePages = [
  '/',
  '/learn',
  '/learn/study-skills',
  '/learn/study-skills/cards',
  '/learn/study-skills/fill-in',
  '/learn/study-skills/label-it',
  '/learn/study-skills/learn-mode',
  '/learn/study-skills/matching',
  '/learn/study-skills/organizer',
  '/learn/study-skills/questions',
  '/play',
  '/support',
] as const;
