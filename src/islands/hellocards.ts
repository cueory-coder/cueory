/**
 * Hello cards (Task 201): pure logic for the flip-the-card conversation starters. No scoring, no accounts and nothing
 * saved or sent. The starters are draft sample text in content/games/hello-cards until Christian approves the wording.
 */
export const HELLO_CATEGORIES = ['patients', 'coworkers', 'classmates', 'yourself'] as const;
export type HelloCategory = (typeof HELLO_CATEGORIES)[number];

export const HELLO_DEPTHS = ['small', 'deep'] as const;
export type HelloDepth = (typeof HELLO_DEPTHS)[number];
/** What the two-option switch says. */
export const HELLO_DEPTH_LABELS: Record<HelloDepth, string> = { small: 'small talk', deep: 'deep convo' };

export interface HelloStarter {
  id: string;
  category: HelloCategory;
  depth: HelloDepth;
  text: string;
}

/** What the category buttons say, and the plain line that goes with each. */
export const HELLO_CATEGORY_LABELS: Record<HelloCategory, string> = {
  patients: 'patients',
  coworkers: 'co-workers',
  classmates: 'classmates',
  yourself: 'get to know yourself',
};

export function isHelloCategory(value: unknown): value is HelloCategory {
  return typeof value === 'string' && (HELLO_CATEGORIES as readonly string[]).includes(value);
}

/** Only the starters for one category, in the order given. */
export function startersFor(starters: readonly HelloStarter[], category: HelloCategory, depth?: HelloDepth): HelloStarter[] {
  return starters.filter((starter) => starter.category === category && (depth === undefined || starter.depth === depth));
}

/**
 * Picks the next starter at random from the category. It never repeats the one just shown (when there is another to
 * show), and it walks through every starter before any comes round again: `seen` holds the ids already shown in this
 * pass and the caller passes the returned `seen` back in.
 */
export function nextStarter(
  starters: readonly HelloStarter[],
  category: HelloCategory,
  depth: HelloDepth,
  seen: readonly string[],
  lastId: string | null,
  random: () => number = Math.random,
): { starter: HelloStarter | null; seen: string[] } {
  const pool = startersFor(starters, category, depth);
  if (pool.length === 0) return { starter: null, seen: [] };
  let fresh = pool.filter((starter) => !seen.includes(starter.id) && starter.id !== lastId);
  let used = seen.filter((id) => pool.some((starter) => starter.id === id));
  if (fresh.length === 0) {
    // Everything has been shown: start a new pass, still skipping the card on screen.
    used = [];
    fresh = pool.length > 1 ? pool.filter((starter) => starter.id !== lastId) : [...pool];
  }
  const draw = random();
  if (!Number.isFinite(draw) || draw < 0 || draw >= 1) throw new Error('random must return a number from 0 up to 1.');
  const starter = fresh[Math.floor(draw * fresh.length)]!;
  return { starter: { ...starter }, seen: [...used, starter.id] };
}

/** The "yourself" cards are questions to answer privately, not to ask someone else. */
export function isReflective(category: HelloCategory): boolean {
  return category === 'yourself';
}

/** Whole days from a fixed start to the visitor's own calendar date (local year, month and day; no time of day). */
export function dayIndex(date: Date): number {
  const start = Date.UTC(2026, 10, 1);
  return Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - start) / 86_400_000);
}

/**
 * The prompt of the day: the same card for everyone on the same calendar date, worked out from the date alone (no
 * server, no account, nothing stored). Days go round the categories in turn, then through each category's cards in id
 * order. With a depth, only that depth's cards are used (the page shows the prompt for the chosen depth). Empty categories are skipped; with no starters at all there is no prompt.
 */
export function promptOfTheDay(starters: readonly HelloStarter[], date: Date, depth?: HelloDepth): HelloStarter | null {
  const piles = HELLO_CATEGORIES.map((category) =>
    startersFor(starters, category, depth).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  ).filter((pile) => pile.length > 0);
  if (piles.length === 0) return null;
  const day = dayIndex(date);
  const mod = (n: number, m: number) => ((n % m) + m) % m;
  const pile = piles[mod(day, piles.length)]!;
  const starter = pile[mod(Math.floor(day / piles.length), pile.length)]!;
  return { ...starter };
}

/** Milliseconds from `date` until the next local midnight (at least one second, so a timer never fires early). */
export function msUntilNextDay(date: Date): number {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return Math.max(1000, next.getTime() - date.getTime());
}
