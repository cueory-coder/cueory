import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { sentenceParts } from './islands/fillin';
import { parseSet as parseLabelSet } from './islands/labelit';
import { sampleChecker, type SampleItem } from './islands/questions';
import { questionContentProblems } from './content/question-validation';
import { existsSync } from 'node:fs';
import { modelFileProblems, visualProblems } from './visuals/sources';
import { videoSchema } from './videos/schema';
import { repeatedCardIndexes } from './content/card-schema';
import { lessonSentenceProblems } from './content/lesson-validation';

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
    status: z.enum(['placeholder', 'sample', 'draft', 'in_review', 'published']),
    sentences: z
      .array(
        z.object({
          id: z.string().regex(/^[a-z0-9-]+$/),
          text: z.string().min(1).max(400),
        }),
      )
      .min(1)
      .superRefine((sentences, context) => {
        for (const message of lessonSentenceProblems(sentences)) {
          context.addIssue({ code: 'custom', message });
        }
      }),
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
    status: z.enum(['placeholder', 'sample', 'draft', 'in_review', 'published']),
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
      .min(1)
      .superRefine((cards, context) => {
        for (const index of repeatedCardIndexes(cards.map((card) => card.id))) {
          context.addIssue({
            code: 'custom',
            path: [index, 'id'],
            message: 'a card id is repeated in this deck',
          });
        }
      }),
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
 * Organizer sets (ROADMAP Task 4): one JSON file per lesson in /content/organizer, sorted with OrganizerBoard. The rules
 * match parseSet in src/islands/organizer.ts: 2 to 4 groups, 4 to 12 items, unique ids, every item in a real group.
 * Until reviewed batches exist (Task 2 and 3), a set is an everyday "sample" and the page says so; no clinical facts.
 */
const organizerId = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'an id is lowercase letters, digits and dashes');
const organizer = defineCollection({
  loader: glob({ base: './content/organizer', pattern: '*.json' }),
  schema: z
    .object({
      lesson: z.string().regex(/^[a-z0-9-]+$/),
      status: z.literal('sample'),
      title: z.string().min(1).max(200),
      groups: z
        .array(z.object({ id: organizerId.refine((id) => id !== 'tray', 'tray is reserved for unsorted items'), name: z.string().min(1).max(200) }))
        .min(2)
        .max(4),
      items: z.array(z.object({ id: organizerId, text: z.string().min(1).max(1000), group: organizerId })).min(4).max(12),
    })
    .superRefine(({ groups, items }, context) => {
      const groupIds = new Set(groups.map((group) => group.id));
      if (groupIds.size !== groups.length) context.addIssue({ code: 'custom', path: ['groups'], message: 'a group id is repeated' });
      if (new Set(items.map((item) => item.id)).size !== items.length) {
        context.addIssue({ code: 'custom', path: ['items'], message: 'an item id is repeated' });
      }
      for (const item of items) {
        if (!groupIds.has(item.group)) {
          context.addIssue({ code: 'custom', path: ['items'], message: `item "${item.id}" names a group that does not exist` });
        }
      }
    }),
});

/**
 * Fill-in sets (ROADMAP Task 4): one JSON file per lesson in /content/fill-in, played with FillInBoard. Each sentence
 * wraps its one missing word in double brackets, checked with the same sentenceParts as the board. Until reviewed
 * batches exist, a set is an everyday "sample" and the page says so; no clinical facts.
 */
const fillIn = defineCollection({
  loader: glob({ base: './content/fill-in', pattern: '*.json' }),
  schema: z
    .object({
      lesson: z.string().regex(/^[a-z0-9-]+$/),
      status: z.literal('sample'),
      items: z
        .array(
          z.object({
            id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'an id is lowercase letters, digits and dashes'),
            sentence: z.string().min(1).max(400),
            distractors: z.array(z.string().min(1).max(200)).optional(),
          }),
        )
        .min(1)
        .max(30),
    })
    .superRefine(({ items }, context) => {
      if (new Set(items.map((item) => item.id)).size !== items.length) {
        context.addIssue({ code: 'custom', path: ['items'], message: 'an item id is repeated' });
      }
      items.forEach((item, i) => {
        try {
          sentenceParts(item.sentence);
        } catch (error) {
          context.addIssue({ code: 'custom', path: ['items', i, 'sentence'], message: (error as Error).message });
        }
      });
    }),
});

/**
 * "label it" sets (ROADMAP Task 4c): one JSON file per lesson in /content/label-it, checked with the board's own
 * parseSet (boxes inside the image, unique ids, label text, and an image credit: no credit, no image). The page never
 * puts this file in its HTML; a static endpoint serves it and the board fetches it after the page loads.
 * Until reviewed images with rights records exist (Task 2), a set is an everyday "sample" drawn for Cueory.
 */
const labelIt = defineCollection({
  loader: glob({ base: './content/label-it', pattern: '*.json' }),
  schema: z
    .object({
      lesson: z.string().regex(/^[a-z0-9-]+$/),
      status: z.literal('sample'),
      image: z.object({
        src: z.string().regex(/^\/[\w\-./]+\.(svg|png|webp|jpg)$/, 'the image is a file on this site, starting with /'),
        alt: z.string().min(1).max(300),
        width: z.number().positive(),
        height: z.number().positive(),
        credit: z.string().min(1).max(300),
      }),
      labels: z.array(z.object({ id: z.string(), text: z.string(), x: z.number(), y: z.number(), w: z.number(), h: z.number() })),
    })
    .superRefine((data, context) => {
      try {
        parseLabelSet({ id: 'check', image: data.image, labels: data.labels });
      } catch (error) {
        context.addIssue({ code: 'custom', path: ['labels'], message: (error as Error).message });
      }
    }),
});

/**
 * Sample questions (ROADMAP Task 4, D-33, D-45): one JSON file per lesson in /content/questions, with everyday
 * questions only. Their keys and rationales are for the sample checker; real questions never go in this repository:
 * their keys stay in the database and are checked by check_answer (Task 2). Checked with the player's own
 * sampleChecker, which refuses anything that isn't marked "sample".
 */
const choiceId = z.enum(['a', 'b', 'c', 'd', 'e']);
const questions = defineCollection({
  loader: glob({ base: './content/questions', pattern: '*.json' }),
  schema: z
    .object({
      lesson: z.string().regex(/^[a-z0-9-]+$/),
      status: z.literal('sample'),
      items: z
        .array(
          z.object({
            id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'an id is lowercase letters, digits and dashes'),
            status: z.literal('sample'),
            type: z.enum(['single', 'sata']),
            stem: z.string().min(1).max(400),
            choices: z.array(z.object({ id: choiceId, text: z.string().min(1).max(300) })).min(2).max(5),
            key: z.array(choiceId).min(1),
            rationales: z.partialRecord(choiceId, z.string().min(1).max(400)),
          }),
        )
        .min(1)
        .max(30),
    })
    .superRefine(({ items }, context) => {
      try {
        sampleChecker(items as SampleItem[]);
      } catch (error) {
        context.addIssue({ code: 'custom', path: ['items'], message: (error as Error).message });
      }
      for (const message of questionContentProblems(items)) {
        context.addIssue({ code: 'custom', path: ['items'], message });
      }
    }),
});

/**
 * The small crossword (internal id cueword, D-70): sample puzzles, one JSON file each in /content/games/cueword. The
 * shape is checked here; /play also runs each one through the game's own parsePuzzle at build time, so a clue that
 * doesn't match a word stops the build with a plain message.
 */
const clue = z.object({ number: z.number().int().positive(), text: z.string().min(1).max(120) });
const cueword = defineCollection({
  loader: glob({ base: './content/games/cueword', pattern: '**/*.json' }),
  schema: z.object({
    status: z.literal('sample'),
    grid: z
      .array(z.string().regex(/^[A-Z.]{3,15}$/, 'a crossword row is 3 to 15 capital letters or dots'))
      .min(3)
      .max(15),
    clues: z.object({ across: z.array(clue), down: z.array(clue) }),
  }),
});

/**
 * Word path (internal id suture, D-71): sample puzzles, one JSON file each in /content/games/suture. The shape is checked
 * here; /play also runs each one through the game's own parsePuzzle at build time.
 * Task 97: each sample is a themed word search. The theme (its title) is required here; the grid is up to 11 by 11; a
 * word's cue is optional, since the words themselves are the list the student sees.
 */
const suture = defineCollection({
  loader: glob({ base: './content/games/suture', pattern: '**/*.json' }),
  schema: z.object({
    status: z.literal('sample'),
    theme: z.string().trim().min(1).max(60),
    grid: z.array(z.string().regex(/^[A-Z]{3,11}$/, 'a word path row is 3 to 11 capital letters')).min(3).max(11),
    words: z
      .array(
        z.object({
          cue: z.string().min(1).max(120).optional(),
          answer: z.string().regex(/^[A-Z]{3,11}$/),
          path: z.array(z.tuple([z.number().int().min(0), z.number().int().min(0)])),
        }),
      )
      .min(3)
      .max(20),
  }),
});

/**
 * The visuals kit (Task 6, D-56, docs/VISUALS.md): one source file per visual in /content/visuals. Every label and
 * every depiction points to a source that gives the book's exact words, its section and the page address, and only
 * allowed books can be quoted (src/visuals/sources.ts). The build stops with a plain message when a file breaks a rule.
 * Only a visual whose file says "approved" can appear on a page.
 */
const visualId = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'an id is lowercase letters, digits and dashes');
// A 3D model's label is named after its structure's BodyParts3D id, which is also the model's node name (FMA7204,
// FMA7198nsn, BP24), and cites that structure's parts-list line as bp3d-<id> (Task 177).
const structureId = z.string().regex(/^(FMA|BP)\d+[a-z]*$/, 'a structure id is FMA or BP, digits, then lowercase letters');
const structureSourceId = z.string().regex(/^bp3d-(FMA|BP)\d+[a-z]*$/, 'a structure source id is bp3d- and the structure id');
const visuals = defineCollection({
  // One file per visual, directly in content/visuals (no subfolders), so the unit tests check exactly these files.
  loader: glob({ base: './content/visuals', pattern: '*.json' }),
  schema: z
    .object({
      id: visualId,
      title: z.string().min(1).max(120),
      kind: z.enum(['diagram', 'model', 'overlay']),
      lessonIds: z.array(z.string().regex(/^U\d{2}-T\d{2}-L\d{2}$/, 'a lesson id looks like U01-T01-L01')).min(1),
      status: z.enum(['draft', 'approved']),
      labels: z.array(
        z.object({
          id: visualId.or(structureId),
          text: z.string().min(1).max(120),
          source: visualId.or(structureSourceId),
          group: z.string().min(1).max(120).optional(),
          layer: z.enum(['skin', 'muscle', 'nerves', 'vessels', 'organs', 'skeleton']).optional(),
        }),
      ),
      depictions: z.array(z.object({ id: visualId, what: z.string().min(1).max(300), source: visualId })),
      sources: z
        .array(
          z.object({
            id: visualId.or(structureSourceId),
            quote: z.string().min(1).max(1000),
            book: z.string().min(1),
            section: z.string().min(1).max(200),
            url: z.string().regex(/^https:\/\/\S+$/, 'a page address starts with https://'),
            license: z.string().min(1),
            retrieved: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'retrieved is the day the words were copied, YYYY-MM-DD'),
          }),
        )
        .min(1),
      // A 3D model's file under public/ (kind "model" only), the atlas release and how the files reached us.
      model: z
        .object({ file: z.string().min(1).max(200), release: z.string().min(1).max(120), via: z.string().min(1).max(200).optional() })
        .optional(),
    })
    .superRefine((visual, context) => {
      const problems = [...visualProblems(visual), ...modelFileProblems(visual, (path) => existsSync(`public/${path}`))];
      for (const { field, message } of problems) context.addIssue({ code: 'custom', path: [field], message });
    }),
});

/**
 * Lesson videos (D-82): one JSON file per video in /content/videos. The videoId is a YouTube video id
 * (or a clearly labeled placeholder). A video appears on the lesson page only when its status is 'published'.
 */
const videos = defineCollection({
  loader: glob({ base: './content/videos', pattern: '**/*.json' }),
  schema: videoSchema,
});

/**
 * Hello cards (Task 201): conversation starters for the flip-the-card game, in content/games/hello-cards. Warm, open
 * questions with no clinical facts; draft samples until Christian approves the wording.
 */
const helloCards = defineCollection({
  loader: glob({ base: './content/games/hello-cards', pattern: '**/*.json' }),
  schema: z
    .object({
      // `sample` is a draft awaiting Christian's wording review; only `approved` may reach the live site.
      status: z.enum(['sample', 'approved']),
      note: z.string().max(300).optional(),
      starters: z
        .array(
          z.object({
            id: z.string().regex(/^[a-z]+(-[a-z0-9]+)+$/, 'an id is lowercase letters, digits and dashes'),
            category: z.enum(['patients', 'coworkers', 'classmates', 'yourself']),
            depth: z.enum(['small', 'deep']),
            text: z.string().trim().min(5).max(140),
          }),
        )
        .min(3),
    })
    .superRefine(({ starters }, context) => {
      if (new Set(starters.map((starter) => starter.id)).size !== starters.length) {
        context.addIssue({ code: 'custom', path: ['starters'], message: 'a starter id is repeated' });
      }
      for (const category of ['patients', 'coworkers', 'classmates', 'yourself']) {
        if (!starters.some((starter) => starter.category === category)) {
          context.addIssue({ code: 'custom', path: ['starters'], message: `no starter for ${category}` });
        }
        for (const depth of ['small', 'deep']) {
          if (!starters.some((starter) => starter.category === category && starter.depth === depth)) {
            context.addIssue({ code: 'custom', path: ['starters'], message: `no ${depth} starter for ${category}` });
          }
        }
      }
    }),
});

export const collections = { lessons, cards, pulse, triage, cueword, suture, 'hello-cards': helloCards, organizer, 'fill-in': fillIn, 'label-it': labelIt, questions, visuals, videos };
