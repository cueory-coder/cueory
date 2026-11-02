/**
 * Device-local study resume, Task 104.
 *
 * This stores STUDENT RESPONSES, never correct answers, question text, rationales,
 * user IDs or tokens. The future study-island adapter must pass only the fields
 * listed in ResumeDraft. Nothing is uploaded or synced here.
 */
import type { KeyValueStorage } from './storage';

export const RESUME_STORAGE_KEY = 'cueory-resume';
export const RESUME_VERSION = 1 as const;
export const RESUME_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const MAX_RESUME_LENGTH = 32_768;

export const RESUME_TOOLS = [
  'cards', 'learn', 'matching', 'organizer', 'fill-in', 'label-it',
  'questions', 'review', 'sharpening', 'game',
] as const;
export type ResumeTool = (typeof RESUME_TOOLS)[number];

export type ResumeAnswer =
  | string
  | boolean
  | number
  | null
  | string[]
  | Record<string, string>;

export interface ResumeTimer {
  status: 'off' | 'running' | 'paused';
  /** The time displayed when the snapshot was taken. */
  elapsedMs: number;
  durationMs: number;
}

export interface ResumeDraft {
  tool: ResumeTool;
  /** A relative path to a Cueory study page. Never a full URL or redirect. */
  page: string;
  module?: string;
  step?: string;
  /** Zero-based index of the exact current item. */
  itemIndex: number;
  itemId?: string;
  totalItems: number;
  /** Only the student's submissions, keyed by item ID. */
  answers: Record<string, ResumeAnswer>;
  timer: ResumeTimer | null;
  phase: 'working' | 'results';
}

export interface ResumeSnapshot extends ResumeDraft {
  version: typeof RESUME_VERSION;
  /** Time in Unix milliseconds, supplied when the snapshot was saved. */
  savedAt: number;
}

const ROUTE = /^\/(?:learn(?:\/[a-z0-9_-]+)*|play|review(?:\/[a-z0-9_-]+)*|sharpen(?:ing)?(?:\/[a-z0-9_-]+)*)(?:#[a-z0-9_-]+)?$/i;
const ID = /^[a-z0-9][a-z0-9_-]{0,79}$/i;
const MAX_ITEMS = 500;
const MAX_ANSWERS = 500;
const MAX_ANSWER_TEXT = 500;
const MAX_TIMER_MS = 24 * 60 * 60 * 1000;
const MAX_FUTURE_MS = 0;
const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const FIELDS = new Set([
  'tool', 'page', 'module', 'step', 'itemIndex', 'itemId', 'totalItems',
  'answers', 'timer', 'phase', 'version', 'savedAt',
]);

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}
function smallText(value: unknown): value is string {
  return typeof value === 'string' && [...value].length <= MAX_ANSWER_TEXT &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
}
function validKey(value: string): boolean {
  return ID.test(value) && !BLOCKED_KEYS.has(value);
}
function answerValue(value: unknown): value is ResumeAnswer {
  if (value === null || typeof value === 'boolean' || smallText(value)) return true;
  if (typeof value === 'number') return Number.isFinite(value) && Math.abs(value) <= 1_000_000;
  if (Array.isArray(value)) return value.length <= 50 && value.every(smallText);
  if (!object(value)) return false;
  const entries = Object.entries(value);
  return entries.length <= 50 && entries.every(([key, entry]) => validKey(key) && smallText(entry));
}
function validTimer(value: unknown): value is ResumeTimer | null {
  if (value === null) return true;
  if (!object(value)) return false;
  if (Object.keys(value).some(key => !['status', 'elapsedMs', 'durationMs'].includes(key))) return false;
  return ['off', 'running', 'paused'].includes(String(value.status)) &&
    integer(value.elapsedMs, 0, MAX_TIMER_MS) &&
    integer(value.durationMs, 0, MAX_TIMER_MS) &&
    (value.status === 'off' || value.durationMs > 0);
}

/** Pure, strict parser. Unreadable, expired, oversized or unsafe data is never resumed. */
export function parseResume(raw: string | null | undefined, now: number): ResumeSnapshot | null {
  if (!raw || raw.length > MAX_RESUME_LENGTH || !integer(now, 1, Number.MAX_SAFE_INTEGER)) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!object(value) || Object.keys(value).some(key => !FIELDS.has(key))) return null;
  const { tool, page, module, step, itemId, itemIndex, totalItems, answers, timer, phase, version, savedAt } = value;
  if (version !== RESUME_VERSION || !RESUME_TOOLS.includes(tool as ResumeTool)) return null;
  if (typeof page !== 'string' || page.length > 240 || !ROUTE.test(page) || page.includes('//') || page.includes('..')) return null;
  if (module !== undefined && (typeof module !== 'string' || !validKey(module))) return null;
  if (step !== undefined && (typeof step !== 'string' || !validKey(step))) return null;
  if (itemId !== undefined && (typeof itemId !== 'string' || !validKey(itemId))) return null;
  if (!integer(totalItems, 1, MAX_ITEMS) || !integer(itemIndex, 0, totalItems - 1)) return null;
  if (phase !== 'working' && phase !== 'results') return null;
  // A timed sharpening round cannot be resumed; its result screen can.
  if (tool === 'sharpening' && phase !== 'results') return null;
  if (!validTimer(timer)) return null;
  if (!integer(savedAt, 1, Number.MAX_SAFE_INTEGER) ||
      savedAt > now + MAX_FUTURE_MS || now - savedAt >= RESUME_TTL_MS) return null;
  if (!object(answers) || Object.keys(answers).length > MAX_ANSWERS) return null;
  if (!Object.entries(answers).every(([key, answer]) => validKey(key) && answerValue(answer))) return null;

  // Round trip through JSON above detached the value from the caller; use an
  // own-property map, not an object that could inherit an unexpected key.
  const copiedAnswers = Object.fromEntries(Object.entries(answers)) as Record<string, ResumeAnswer>;
  return {
    version: RESUME_VERSION,
    tool: tool as ResumeTool,
    page,
    ...(module === undefined ? {} : { module: module as string }),
    ...(step === undefined ? {} : { step: step as string }),
    ...(itemId === undefined ? {} : { itemId: itemId as string }),
    itemIndex,
    totalItems,
    answers: copiedAnswers,
    timer: timer as ResumeTimer | null,
    phase,
    savedAt,
  };
}

/** Returns null on blocked localStorage; bad or expired entries are removed when possible. */
export function readResume(storage: KeyValueStorage | undefined, now = Date.now()): ResumeSnapshot | null {
  try {
    if (!storage) return null;
    const raw = storage.getItem(RESUME_STORAGE_KEY);
    if (raw === null) return null;
    const snapshot = parseResume(raw, now);
    if (!snapshot) {
      try { storage.removeItem(RESUME_STORAGE_KEY); } catch { /* blocked storage */ }
    }
    return snapshot;
  } catch {
    return null;
  }
}

/** Saves one small validated snapshot. Never writes if storage is blocked. */
export function saveResume(storage: KeyValueStorage | undefined, draft: ResumeDraft, now = Date.now()): boolean {
  if (!storage) return false;
  try {
    const text = JSON.stringify({ ...draft, version: RESUME_VERSION, savedAt: now });
    if (!parseResume(text, now)) return false;
    storage.setItem(RESUME_STORAGE_KEY, text);
    return true;
  } catch {
    return false;
  }
}

export function clearResume(storage: KeyValueStorage | undefined): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(RESUME_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * The study-island owner calls this after every answer and step. Also call it
 * on pagehide and when the page becomes hidden (iOS can skip beforeunload).
 * This hook only installs listeners; it never writes without the caller's draft.
 */
export function attachResumeLifecycle(
  storage: KeyValueStorage | undefined,
  currentDraft: () => ResumeDraft | null,
  now: () => number = Date.now,
): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  const save = () => {
    try {
      const draft = currentDraft();
      if (draft) saveResume(storage, draft, now());
    } catch {
      // Page exit must never crash the student, even if the island is unmounting.
    }
  };
  const hidden = () => {
    if (document.visibilityState === 'hidden') save();
  };
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', hidden);
  return () => {
    window.removeEventListener('pagehide', save);
    document.removeEventListener('visibilitychange', hidden);
  };
}

/** Plain, escaped by React when displayed. No patient text or personal details. */
export function resumeName(snapshot: ResumeSnapshot): string {
  return [snapshot.module?.replaceAll('-', ' '), snapshot.tool.replaceAll('-', ' ')].filter(Boolean).join(' · ');
}
export function resumePosition(snapshot: ResumeSnapshot): string {
  return snapshot.phase === 'results' ? 'results' : 'question ' + (snapshot.itemIndex + 1) + ' of ' + snapshot.totalItems;
}
