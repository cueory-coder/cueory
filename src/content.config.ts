import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

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

export const collections = { lessons, cards, pulse };
