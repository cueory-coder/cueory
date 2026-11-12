import { z } from 'astro/zod';

/** Validate only publicly labeled sample fixtures, not approved live content. */
export const pulseSampleSchema = z.object({
  status: z.literal('sample'),
  // The current playable game uses exactly five letters.
  word: z.string().regex(/^[a-z]{5}$/),
  cue: z.string().trim().min(1).max(120),
}).strict();

const triageTerm = z.string().regex(/^[a-z][a-z -]{0,23}$/);
const triageGroup = z.object({
  name: z.string().regex(/^[a-z][a-z -]{0,31}$/),
  terms: z.array(triageTerm).length(3),
}).strict();

export const triageSampleSchema = z.object({
  status: z.literal('sample'),
  groups: z.array(triageGroup).length(3),
  oddOne: triageTerm,
}).strict().superRefine(({ groups, oddOne }, context) => {
  const names = new Set<string>();
  const terms = new Set<string>();
  groups.forEach((group, groupIndex) => {
    if (names.has(group.name)) {
      context.addIssue({ code: 'custom', path: ['groups', groupIndex, 'name'], message: 'group names must be unique' });
    }
    names.add(group.name);
    group.terms.forEach((term, termIndex) => {
      if (terms.has(term)) {
        context.addIssue({ code: 'custom', path: ['groups', groupIndex, 'terms', termIndex], message: 'terms must be unique' });
      }
      terms.add(term);
    });
  });
  if (terms.has(oddOne)) {
    context.addIssue({ code: 'custom', path: ['oddOne'], message: 'odd one must not be in a group' });
  }
});

const sampleText = z.string().min(1).max(200).regex(
  /^\[sample(?: [^\[\]\r\n]+)?\]$/,
  'stat questions and choices must contain only bracketed [sample ...] text',
);
const statChoice = (letter: 'a' | 'b' | 'c' | 'd') =>
  z.object({ id: z.literal(letter), text: sampleText }).strict();
const statQuestion = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  stem: sampleText,
  choices: z.tuple([statChoice('a'), statChoice('b'), statChoice('c'), statChoice('d')]),
  sampleKey: z.enum(['a', 'b', 'c', 'd']),
}).strict();

export const statSampleSchema = z.object({
  status: z.literal('sample'),
  note: z.string().max(300).optional(),
  questions: z.array(statQuestion).length(15),
}).strict().superRefine(({ questions }, context) => {
  const ids = new Set<string>();
  questions.forEach((question, index) => {
    if (ids.has(question.id)) {
      context.addIssue({ code: 'custom', path: ['questions', index, 'id'], message: 'question ids must be unique' });
    }
    ids.add(question.id);
  });
});

const categories = ['patients', 'coworkers', 'classmates', 'yourself'] as const;
const depths = ['small', 'deep'] as const;
const helloStarter = z.object({
  id: z.string().regex(/^[a-z]+(-[a-z0-9]+)+$/),
  category: z.enum(categories),
  depth: z.enum(depths),
  text: z.string().trim().min(5).max(140).refine(
    (text) => text.endsWith('?') && !/https?:|www\.|@|<|>/i.test(text),
    { message: 'starter must be a question without a link or markup' },
  ),
}).strict();

export const helloCardsSampleSchema = z.object({
  status: z.literal('sample'),
  note: z.string().max(300).optional(),
  starters: z.array(helloStarter).min(3),
}).strict().superRefine(({ starters }, context) => {
  const ids = new Set<string>();
  const texts = new Set<string>();
  starters.forEach((starter, index) => {
    if (ids.has(starter.id)) {
      context.addIssue({ code: 'custom', path: ['starters', index, 'id'], message: 'starter ids must be unique' });
    }
    if (texts.has(starter.text)) {
      context.addIssue({ code: 'custom', path: ['starters', index, 'text'], message: 'starter texts must be unique' });
    }
    ids.add(starter.id);
    texts.add(starter.text);
  });
  for (const category of categories) {
    for (const depth of depths) {
      if (!starters.some((starter) => starter.category === category && starter.depth === depth)) {
        context.addIssue({ code: 'custom', path: ['starters'], message: 'missing ' + depth + ' starter for ' + category });
      }
    }
  }
});

export const gameSampleSchemas = {
  pulse: pulseSampleSchema,
  stat: statSampleSchema,
  'hello-cards': helloCardsSampleSchema,
  triage: triageSampleSchema,
} as const;
