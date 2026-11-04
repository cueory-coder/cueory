/**
 * Plain-language wording for the content checker (scripts/check-content.mjs). Pure: no files, no Astro, so it can be
 * unit tested. It turns a schema problem into one line a person can act on ("content/cards/u03-t02-l01.json: card 4
 * has no back text") and says which lessons become pages, which stay labeled samples and which are drafts.
 */
import { visibility, type Catalog, type CatalogLesson } from '../../src/lessons/catalog.ts';

/** The parts of a zod issue the wording uses (zod 4, as Astro ships it). */
export interface Issue {
  code: string;
  path: readonly PropertyKey[];
  message: string;
  origin?: string;
  minimum?: number | bigint;
  maximum?: number | bigint;
  expected?: string;
  values?: readonly unknown[];
  keys?: readonly string[];
}

const SINGULAR: Record<string, string> = {
  cards: 'card', items: 'item', sentences: 'sentence', groups: 'group', labels: 'label', choices: 'choice',
  words: 'word', depictions: 'depiction', sources: 'source', grid: 'grid row', lessonIds: 'lesson id', key: 'key letter',
  across: 'across clue', down: 'down clue', terms: 'term', path: 'path step',
};
const FIELD: Record<string, string> = {
  front: 'front text', back: 'back text', stem: 'question text', alt: 'alt text', src: 'image file',
  oddOne: 'odd one out', videoId: 'video id', captionsUrl: 'captions address', transcriptUrl: 'transcript address',
  url: 'page address', lessonIds: 'lesson ids',
};

const fieldName = (key: string) => FIELD[key] ?? key;
const plural = (key: string, count: number) => (count === 1 ? SINGULAR[key] ?? key : key === 'grid' ? 'grid rows' : key);

/** "card 4", "the image", "group 2's name": who a path points at, read the way a person would say it. */
function subjectOf(path: readonly PropertyKey[]): string {
  const parts: string[] = [];
  for (let index = 0; index < path.length; index++) {
    const key = path[index]!;
    const next = path[index + 1];
    if (typeof key === 'number') continue;
    const name = String(key);
    if (typeof next === 'number') {
      parts.push(`${SINGULAR[name] ?? name} ${next + 1}`);
      index++;
    } else {
      parts.push(parts.length ? fieldName(name) : `the ${fieldName(name)}`);
    }
  }
  if (!parts.length) return 'the file';
  return parts.map((part, index) => (index < parts.length - 1 ? `${part}'s` : part)).join(' ');
}

function valueAt(data: unknown, path: readonly PropertyKey[]): unknown {
  let value = data;
  for (const key of path) {
    if (value === null || typeof value !== 'object') return undefined;
    value = (value as Record<PropertyKey, unknown>)[key];
  }
  return value;
}

const typeWords: Record<string, string> = {
  string: 'text', number: 'a number', array: 'a list', object: 'a group of fields', boolean: 'true or false',
};
const shown = (value: unknown) => (typeof value === 'string' ? `"${value.length > 40 ? value.slice(0, 40) + '…' : value}"` : JSON.stringify(value));
// zod's own default messages start like this; a schema's own message (a regex hint, a refine) is worth repeating.
const isDefaultMessage = (message: string) => /^(Invalid|Too (big|small)|Expected|Unrecognized)/.test(message);

/** One problem, in words, without the file name. */
export function describeIssue(issue: Issue, data: unknown): string {
  const path = issue.path;
  const last = path.at(-1);
  const value = valueAt(data, path);
  const owner = subjectOf(typeof last === 'number' ? path : path.slice(0, -1));
  const field = typeof last === 'string' ? fieldName(last) : undefined;
  const whole = subjectOf(path);
  const missing = `${owner} has no ${field ?? 'value'}`;

  switch (issue.code) {
    case 'invalid_type':
      if (value === undefined) return field ? missing : `${whole} is missing`;
      return `${whole} should be ${typeWords[issue.expected ?? ''] ?? issue.expected}, not ${shown(value)}`;
    case 'too_small': {
      const min = Number(issue.minimum);
      if (issue.origin === 'string') {
        return min <= 1 && field ? missing : `${whole} is too short: at least ${min} characters`;
      }
      if (issue.origin === 'array' && typeof last === 'string') return `${owner} needs at least ${min} ${plural(last, min)}`;
      return `${whole} is too small: at least ${min}`;
    }
    case 'too_big': {
      const max = Number(issue.maximum);
      if (issue.origin === 'string') {
        const length = typeof value === 'string' ? `; it has ${value.length}` : '';
        return `${whole} is too long: at most ${max} characters${length}`;
      }
      if (issue.origin === 'array' && typeof last === 'string') return `${owner} has too many ${plural(last, 2)}: at most ${max}`;
      return `${whole} is too big: at most ${max}`;
    }
    case 'invalid_value': {
      const choices = (issue.values ?? []).map((choice) => shown(choice));
      return `${whole} is ${shown(value)}; use ${choices.length === 1 ? choices[0] : 'one of ' + choices.join(', ')}`;
    }
    case 'invalid_format':
      return isDefaultMessage(issue.message)
        ? `${whole} ${shown(value)} doesn't have the right shape`
        : `${whole} ${shown(value)}: ${issue.message}`;
    case 'unrecognized_keys':
      return `${whole} has fields the site doesn't use: ${(issue.keys ?? []).join(', ')}`;
    default:
      return isDefaultMessage(issue.message) ? `${whole} isn't right (${issue.message})` : `${whole}: ${issue.message}`;
  }
}

/** Every problem of one file, each as "<file>: <problem>". */
export function fileProblems(file: string, issues: readonly Issue[], data: unknown): string[] {
  return [...new Set(issues.map((issue) => `${file}: ${describeIssue(issue, data)}`))];
}

/** A file the checker read, for the lesson report. */
export interface ReadFile { file: string; id: string; data: unknown }

const statusOf = (data: unknown) =>
  data !== null && typeof data === 'object' ? (data as Record<string, unknown>).status : undefined;
const lessonOf = (data: unknown) =>
  data !== null && typeof data === 'object' ? (data as Record<string, unknown>).lesson : undefined;

const MODE_WORDS: Record<string, string> = {
  cards: 'cards', learn: 'learn mode', matching: 'matching', organizer: 'organizer', 'fill-in': 'fill-in',
  'label-it': 'label it', questions: 'questions',
};

function lessonLine(lesson: CatalogLesson, title: unknown, status: unknown): string {
  const modes = lesson.modes.map((mode) => {
    const part = mode.id === 'organizer' ? lesson.organizer : mode.id === 'fill-in' ? lesson.fillIn
      : ['cards', 'learn', 'matching'].includes(mode.id) ? lesson.cards : undefined;
    return part?.labeled ? `${MODE_WORDS[mode.id]} (labeled)` : MODE_WORDS[mode.id];
  });
  const name = typeof title === 'string' ? title : lesson.name;
  return `  ${lesson.href}  ${name} (${String(status)})${modes.length ? ' · ' + modes.join(', ') : ' · no study modes yet'}`;
}

/**
 * Which lessons become pages, which stay labeled samples, and which files are drafts that won't appear. `lessons` and
 * `companions` are every file read, valid or not; the catalog was built from them.
 */
export function lessonReport(catalog: Catalog, lessons: readonly ReadFile[], companions: readonly ReadFile[]): string[] {
  const byId = new Map(lessons.map((file) => [file.id, file]));
  const pages = catalog.lessons.filter((lesson) => !lesson.labeled);
  const samples = catalog.lessons.filter((lesson) => lesson.labeled);
  const shownIds = new Set(catalog.lessons.map((lesson) => lesson.id));
  const drafts: string[] = [];
  for (const file of lessons) {
    if (visibility(statusOf(file.data)) === 'hidden') drafts.push(`  ${file.file} (${String(statusOf(file.data) ?? 'no status')})`);
  }
  for (const file of companions) {
    const status = statusOf(file.data);
    const owner = lessonOf(file.data);
    if (visibility(status) === 'hidden') drafts.push(`  ${file.file} (${String(status ?? 'no status')})`);
    else if (typeof owner === 'string' && byId.has(owner) && !shownIds.has(owner)) {
      drafts.push(`  ${file.file} (hidden with its lesson, ${byId.get(owner)!.file})`);
    }
  }
  const line = (lesson: CatalogLesson) => {
    const file = byId.get(lesson.id);
    const data = (file?.data ?? {}) as Record<string, unknown>;
    return lessonLine(lesson, data.title, data.status);
  };
  return [
    `lessons that become pages: ${pages.length}`, ...pages.map(line),
    `lessons shown as labeled samples or placeholders: ${samples.length}`, ...samples.map(line),
    `drafts that won't appear: ${drafts.length}${drafts.length ? " (keep them on your computer: drafts never go into the public repository)" : ''}`,
    ...drafts,
  ];
}
