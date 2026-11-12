/**
 * puzzlefeed — checks a day's puzzle payload before any game sees it (D-61).
 * Pure logic: no file I/O, no network, no database.
 *
 * Only today's puzzle is accepted. This is a safety net against a wrong file being served;
 * the real protection is the server or CDN never sending tomorrow's answer before its day (D-61).
 */
import { parsePuzzle as parseCueword, type CuewordPuzzle } from './cueword';
import { parsePuzzle as parseSuture, type SuturePuzzle } from './suture';
import type { TriagePuzzle } from './triage';

const GAME_IDS = ['pulse', 'cueword', 'triage', 'suture'] as const;
export type GameId = typeof GAME_IDS[number];

/** The accepted shape of a pulse puzzle. */
export interface PulsePuzzle {
  word: string;
  cue: string;
}

export type AcceptResult =
  | { ok: true; game: 'pulse'; puzzle: PulsePuzzle }
  | { ok: true; game: 'cueword'; puzzle: CuewordPuzzle }
  | { ok: true; game: 'triage'; puzzle: TriagePuzzle }
  | { ok: true; game: 'suture'; puzzle: SuturePuzzle }
  | { ok: false; message: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Validates a pulse puzzle shape. Never echoes the word in any error message. */
function checkPulse(puzzle: unknown): PulsePuzzle | string {
  if (!isRecord(puzzle)) return 'the puzzle must be an object.';
  const { word, cue } = puzzle;
  if (typeof word !== 'string' || !/^[a-z]{5}$/.test(word)) {
    return 'the word must be 5 lowercase letters.';
  }
  if (typeof cue !== 'string' || !cue.trim()) return 'the cue must be a non-empty string.';
  return { word, cue };
}

/** Validates a triage puzzle shape. Never echoes answers in any error message. */
function checkTriage(puzzle: unknown): TriagePuzzle | string {
  if (!isRecord(puzzle)) return 'the puzzle must be an object.';
  const { groups, oddOne } = puzzle;
  if (!Array.isArray(groups) || groups.length < 1) return 'groups must be a non-empty list.';
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    if (!isRecord(g)) return `group ${i + 1} must be an object.`;
    if (typeof g.name !== 'string' || !g.name.trim()) return `group ${i + 1} needs a name.`;
    if (!Array.isArray(g.terms) || g.terms.length < 1) return `group ${i + 1} needs at least one term.`;
    if (g.terms.some((t: unknown) => typeof t !== 'string' || !(t as string).trim())) {
      return `group ${i + 1} has an empty term.`;
    }
  }
  if (typeof oddOne !== 'string' || !oddOne.trim()) return 'oddOne must be a non-empty string.';
  // Duplicate-term check: every term (including oddOne) must be unique after normalization.
  const allTerms = [...(groups as Array<{ terms: string[] }>).flatMap(g => g.terms), oddOne as string];
  const seen = new Set<string>();
  for (const term of allTerms) {
    const key = term.trim().toLowerCase();
    if (seen.has(key)) return 'each term must appear only once.';
    seen.add(key);
  }
  return {
    groups: groups.map((g: Record<string, unknown>) => ({
      name: g.name as string,
      terms: (g.terms as string[]).map(t => t as string),
    })),
    oddOne: oddOne as string,
  };
}

/**
 * Checks a daily puzzle payload before any game sees it.
 *
 * Accepts `{ game, date, puzzle }` where:
 * - `game` is one of the four daily games (`pulse`, `cueword`, `triage`, `suture`)
 * - `date` is exactly `today` (YYYY-MM-DD) — yesterday's and tomorrow's are refused
 * - `puzzle` passes the game's own structural checks
 *
 * Extra fields in the top-level payload are dropped; the returned puzzle is the game's
 * own cleaned shape. Error messages never reveal a puzzle's answer.
 */
export function acceptPuzzle(payload: unknown, today: string): AcceptResult {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return { ok: false, message: 'today must be a YYYY-MM-DD date.' };
  if (!isRecord(payload)) return { ok: false, message: 'the payload must be an object.' };

  const { game, date, puzzle } = payload;

  if (typeof game !== 'string' || !(GAME_IDS as readonly string[]).includes(game)) {
    return { ok: false, message: `game must be one of: ${GAME_IDS.join(', ')}.` };
  }

  if (typeof date !== 'string' || date !== today) {
    return { ok: false, message: 'date must be today.' };
  }

  switch (game as GameId) {
    case 'pulse': {
      const result = checkPulse(puzzle);
      if (typeof result === 'string') return { ok: false, message: result };
      return { ok: true, game: 'pulse', puzzle: result };
    }
    case 'cueword': {
      try {
        return { ok: true, game: 'cueword', puzzle: parseCueword(puzzle) };
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : 'invalid puzzle.' };
      }
    }
    case 'triage': {
      const result = checkTriage(puzzle);
      if (typeof result === 'string') return { ok: false, message: result };
      return { ok: true, game: 'triage', puzzle: result };
    }
    case 'suture': {
      try {
        return { ok: true, game: 'suture', puzzle: parseSuture(puzzle) };
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : 'invalid puzzle.' };
      }
    }
  }
}

/**
 * A date-indexed feed may have no entry for a game today, or may fail to load.
 * Keep those outcomes separate from a usable, validated puzzle.
 *
 * Only today's real puzzle may reach the browser. This selector is a second
 * check, not permission to send future content in a feed (D-61).
 */
export type PuzzleFeedResult =
  | (Extract<AcceptResult, { ok: true }> & { status: 'puzzle' })
  | { status: 'none-today' }
  | { status: 'failed' };

function isGameId(value: unknown): value is GameId {
  return typeof value === 'string' && (GAME_IDS as readonly string[]).includes(value);
}

/**
 * Selects one validated puzzle for today's game from dated payloads.
 * [] or no matching date/game means no puzzle was published today.
 * Malformed feeds, duplicate matches and invalid today's entries fail closed.
 */
export function selectTodayPuzzle(feed: unknown, today: string, game: GameId): PuzzleFeedResult {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || !isGameId(game) || !Array.isArray(feed)) {
      return { status: 'failed' };
    }
    if (feed.length === 0) return { status: 'none-today' };

    // Reject bad envelopes instead of quietly treating corrupted data as an empty day.
    if (feed.some((entry: unknown) =>
      !isRecord(entry)
      || !isGameId(entry.game)
      || typeof entry.date !== 'string'
      || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)
    )) {
      return { status: 'failed' };
    }

    const matches = feed.filter((entry: unknown): entry is Record<string, unknown> =>
      isRecord(entry) && entry.game === game && entry.date === today
    );
    if (matches.length === 0) return { status: 'none-today' };
    if (matches.length !== 1) return { status: 'failed' };

    const result = acceptPuzzle(matches[0], today);
    return result.ok ? { ...result, status: 'puzzle' } : { status: 'failed' };
  } catch {
    return { status: 'failed' };
  }
}

/**
 * Accepts an injected loader, so callers can retry without this module owning
 * network or database code. Never exposes an error's details to the student.
 */
export async function loadTodayPuzzle(
  load: () => Promise<unknown>,
  today: string,
  game: GameId,
): Promise<PuzzleFeedResult> {
  try {
    return selectTodayPuzzle(await load(), today, game);
  } catch {
    return { status: 'failed' };
  }
}
