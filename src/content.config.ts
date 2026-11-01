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
 * The small crossword (internal id cueword, D-67): sample puzzles, one JSON file each in /content/games/cueword. The
 * shape is checked here; /play also runs each one through the game's own parsePuzzle at build time, so a clue that
 * doesn't match a word stops the build with a plain message.
 */
const clue = z.object({ number: z.number().int().positive(), text: z.string().min(1).max(120) });
const cueword = defineCollection({
  loader: glob({ base: './content/games/cueword', pattern: '**/*.json' }),
  schema: z.object({
    status: z.literal('sample'),
    grid: z
      .array(z.string().regex(/^[A-Z.]{3,7}$/, 'a crossword row is 3 to 7 capital letters or dots'))
      .min(3)
      .max(7),
    clues: z.object({ across: z.array(clue), down: z.array(clue) }),
  }),
});

export const collections = { lessons, cards, pulse, triage, cueword };
