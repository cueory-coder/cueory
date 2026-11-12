/**
 * Launch check L4: every live daily game needs at least 14 days of puzzles
 * scheduled ahead (its "runway"). Builds on the runway report in
 * src/content/runway.ts (MR !73), which counts the fresh days left for each game.
 *
 *   node scripts/check-puzzle-runway.mjs              (needs 14 days, from today)
 *   node scripts/check-puzzle-runway.mjs --days 21 --date 2026-11-17
 *
 * Exit 0: every game has enough days. Exit 1: lists each game that is short and
 * by how many days. Exit 2: the check could not run (bad option, missing report).
 * Prints game names and counts only, never puzzle text, answers or clues.
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MIN_RUNWAY_DAYS = 14;

/** Names visitors see, keyed by the report's game id. Unknown ids print as-is. */
const GAME_NAMES = {
  pulse: 'pillo',
  'cueword-easy': 'crossword (easy)',
  'cueword-mid': 'crossword (mid)',
  'cueword-hard': 'crossword (hard)',
  suture: 'word path',
  sudoku: 'sudoku',
};

/** @param {string} game */
export function gameName(game) {
  return Object.hasOwn(GAME_NAMES, game) ? GAME_NAMES[/** @type {keyof typeof GAME_NAMES} */ (game)] : game;
}

/**
 * @typedef {{ game: string, source: string, daysLeft: number | null }} RunwayRow
 * @typedef {{ game: string, name: string, daysLeft: number, shortBy: number }} Shortfall
 */

/** @param {unknown} value */
function checkMinimum(value) {
  if (!Number.isSafeInteger(value) || /** @type {number} */ (value) < 1) {
    throw new RangeError('the minimum runway must be a whole number of days, 1 or more');
  }
  return /** @type {number} */ (value);
}

/**
 * Games below the minimum. Generated games (sudoku makes a new board each day)
 * never run out. Retired sample sets ("legacy-samples", the old sorting game)
 * are not played, so they are left out. A played game whose count is missing
 * or not a whole number is treated as having 0 days, so it can never pass by
 * accident.
 * @param {readonly RunwayRow[]} rows
 * @param {number} [minDays]
 * @returns {Shortfall[]}
 */
export function findShortRunways(rows, minDays = MIN_RUNWAY_DAYS) {
  const minimum = checkMinimum(minDays);
  if (!Array.isArray(rows) || rows.length === 0) throw new RangeError('the runway report is empty');
  return rows
    .filter((row) => row.source !== 'generated' && row.source !== 'legacy-samples')
    .map((row) => {
      const daysLeft = Number.isSafeInteger(row.daysLeft) && /** @type {number} */ (row.daysLeft) > 0
        ? /** @type {number} */ (row.daysLeft) : 0;
      return { game: row.game, name: gameName(row.game), daysLeft, shortBy: minimum - daysLeft };
    })
    .filter((row) => row.shortBy > 0);
}

/** @param {number} count */
const days = (count) => `${count} ${count === 1 ? 'day' : 'days'}`;

/**
 * Plain-language result, one line per short game.
 * @param {readonly Shortfall[]} short
 * @param {number} [minDays]
 */
export function runwayCheckLines(short, minDays = MIN_RUNWAY_DAYS) {
  const minimum = checkMinimum(minDays);
  if (short.length === 0) {
    return [`Puzzle runway OK: every daily game has at least ${days(minimum)} of puzzles scheduled ahead.`];
  }
  return [
    `Puzzle runway too short: ${short.length} ${short.length === 1 ? 'game needs' : 'games need'} at least ${days(minimum)} scheduled ahead.`,
    ...short.map((row) => `- ${row.name}: ${days(row.daysLeft)} left, short by ${days(row.shortBy)}`),
    'Add puzzles for these games, then run this check again.',
  ];
}

/**
 * Reads --days N and --date YYYY-MM-DD (a local calendar date, for checking a
 * future launch day). Anything else is an error.
 * @param {readonly string[]} args
 * @param {Date} [now]
 */
export function parseRunwayArgs(args, now = new Date()) {
  let minDays = MIN_RUNWAY_DAYS;
  let asOf = now;
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (value === undefined) throw new RangeError(`${flag} needs a value`);
    if (flag === '--days') {
      if (!/^\d{1,4}$/.test(value)) throw new RangeError('--days must be a whole number');
      minDays = checkMinimum(Number(value));
    } else if (flag === '--date') {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
      const date = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12) : null;
      if (!date || date.getMonth() !== Number(match?.[2]) - 1 || date.getDate() !== Number(match?.[3])) {
        throw new RangeError('--date must be a real date written YYYY-MM-DD');
      }
      asOf = date;
    } else {
      throw new RangeError(`unknown option ${flag} (use --days N or --date YYYY-MM-DD)`);
    }
  }
  return { minDays, asOf };
}

/** @param {readonly string[]} args */
async function main(args) {
  let options;
  try {
    options = parseRunwayArgs(args);
  } catch (error) {
    process.stderr.write(`Puzzle runway check could not run: ${/** @type {Error} */ (error).message}\n`);
    return 2;
  }
  /** @type {{ puzzleRunways: (asOf: Date) => RunwayRow[] }} */
  let runway;
  try {
    runway = await import('../src/content/runway.ts');
  } catch {
    process.stderr.write('Puzzle runway check could not run: src/content/runway.ts is missing (it arrives with MR !73).\n');
    return 2;
  }
  const short = findShortRunways(runway.puzzleRunways(options.asOf), options.minDays);
  const output = runwayCheckLines(short, options.minDays).join('\n') + '\n';
  if (short.length) process.stderr.write(output);
  else process.stdout.write(output);
  return short.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
