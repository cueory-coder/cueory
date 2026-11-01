import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { visualProblems } from './visuals/sources';

/**
 * Lessons are content, not code: they live as JSON files in /content/lessons.
 * The build fails with a clear message if a file is missing a field or has a
 * value of the wrong shape.
 */
const lessons = defineCollection({
  loader: glob({ base: './content/lessons', pattern: '**/*.json' }),
  schema: z.object({
    course: z.string().min(1),
    order: z.number().int().positive(),
    title: z.string().min(1).max(120),
    summary: z.string().max(300),
    status: z.enum(['placeholder', 'draft', 'in_review', 'published']),
    sentences: z
      .array(
        z.object({
          id: z.string().regex(/^[a-z0-9-]+$/),
          text: z.string().min(1).max(400),
        }),
      )
      .min(1),
  }),
});

/**
 * Cards are content too: one JSON file per lesson deck in /content/cards. `lesson` names the lesson the deck
 * belongs to (a file name in /content/lessons, without .json). A card's optional `blank` is the words from its back
 * that Learn mode's fill-in leaves out (D-43); they must appear in the back exactly as written.
 */
const cards = defineCollection({
  loader: glob({ base: './content/cards', pattern: '**/*.json' }),
  schema: z.object({
    lesson: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string().min(1).max(120),
    status: z.enum(['placeholder', 'draft', 'in_review', 'published']),
    cards: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z0-9-]+$/),
            front: z.string().min(1).max(300),
            back: z.string().min(1).max(600),
            blank: z.string().trim().min(1).max(120).optional(),
          })
          .refine((card) => card.blank === undefined || card.back.includes(card.blank), {
            message: "blank must be words that appear in the card's back, exactly as written",
            path: ['blank'],
          }),
      )
      .min(1),
  }),
});

/**
 * Daily games (D-61): sample puzzles for pulse, one JSON file each in /content/games/pulse. Samples use everyday words
 * and say so on the page. Real puzzles are nursing content whose answers are answer keys, so they never go in this
 * repository: they come from the reviewed database with Task 2, one day at a time (D-61).
 */
const pulse = defineCollection({
  loader: glob({ base: './content/games/pulse', pattern: '**/*.json' }),
  schema: z.object({
    status: z.literal('sample'),
    word: z.string().regex(/^[a-z]{5,7}$/, 'a pulse word is five to seven lowercase letters'),
    cue: z.string().min(1).max(120),
  }),
});

/**
 * triage (D-63): sample sorting puzzles, one JSON file each in /content/games/triage. Three named groups of three terms
 * and one odd one out that belongs to none; every term appears once. Everyday words, labeled as samples on the page.
 */
const term = z.string().regex(/^[a-z][a-z -]{0,23}$/, 'a triage term is lowercase letters, up to 24 characters');
const triage = defineCollection({
  loader: glob({ base: './content/games/triage', pattern: '**/*.json' }),
  schema: z
    .object({
      status: z.literal('sample'),
      groups: z
        .array(
          z.object({
            name: z.string().regex(/^[a-z][a-z -]{0,31}$/, 'a group name is lowercase letters, up to 32 characters'),
            terms: z.array(term).length(3),
          }),
        )
        .length(3),
      oddOne: term,
    })
    .refine(
      ({ groups, oddOne }) => new Set([...groups.flatMap((group) => group.terms), oddOne]).size === 10,
      'every triage term appears once: nine in the groups and the odd one out',
    ),
});

/**
 * The visuals kit (Task 6, D-56, docs/VISUALS.md): one source file per visual in /content/visuals. Every label and
 * every depiction points to a source that gives the book's exact words, its section and the page address, and only
 * allowed books can be quoted (src/visuals/sources.ts). The build stops with a plain message when a file breaks a rule.
 * Only a visual whose file says "approved" can appear on a page.
 */
const visualId = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'an id is lowercase letters, digits and dashes');
const visuals = defineCollection({
  loader: glob({ base: './content/visuals', pattern: '**/*.json' }),
  schema: z
    .object({
      id: visualId,
      title: z.string().min(1).max(120),
      kind: z.enum(['diagram', 'model', 'overlay']),
      lessonIds: z.array(z.string().regex(/^U\d{2}-T\d{2}-L\d{2}$/, 'a lesson id looks like U01-T01-L01')).min(1),
      status: z.enum(['draft', 'approved']),
      labels: z.array(z.object({ id: visualId, text: z.string().min(1).max(80), source: visualId })),
      depictions: z.array(z.object({ id: visualId, what: z.string().min(1).max(300), source: visualId })),
      sources: z
        .array(
          z.object({
            id: visualId,
            quote: z.string().min(1).max(1000),
            book: z.string().min(1),
            section: z.string().min(1).max(200),
            url: z.string().regex(/^https:\/\/\S+$/, 'a page address starts with https://'),
            license: z.string().min(1),
            retrieved: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'retrieved is the day the words were copied, YYYY-MM-DD'),
          }),
        )
        .min(1),
    })
    .superRefine((visual, context) => {
      for (const { field, message } of visualProblems(visual)) context.addIssue({ code: 'custom', path: [field], message });
    }),
});

export const collections = { lessons, cards, pulse, triage, visuals };
