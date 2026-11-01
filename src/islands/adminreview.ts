/** Review-table display rules only. Publishing and admin permissions must also be checked on the server. */
export const REVIEWERS = Object.freeze([
  'gpt1', 'gpt2', 'gpt3', 'gemini', 'claude_sonnet', 'codex', 'claude_final', 'christian',
] as const);
export type Reviewer = typeof REVIEWERS[number];
export type ReviewResult = 'pass' | 'fail' | 'pending';
export type RiskLevel = 'low' | 'medium' | 'high';
export interface ReviewRow {
  version: number;
  risk: RiskLevel;
  publicLabel: string;
  reviews: Record<Reviewer, ReviewResult>;
}
export type CheckedRow = { ok: true; row: ReviewRow } | { ok: false; message: string };

const problem = (message: string): CheckedRow => ({ ok: false, message });
const results: readonly unknown[] = ['pass', 'fail', 'pending'];
const risks: readonly unknown[] = ['low', 'medium', 'high'];
const versionIsValid = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
const plain = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const own = (source: object, key: string): unknown => {
  const descriptor = Object.getOwnPropertyDescriptor(source, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
};

/** A fresh, allowlisted row, or a plain message. Inherited statuses and getters never count as a review. */
export function validateRow(input: unknown): CheckedRow {
  try {
    if (!plain(input)) return problem('use a review row with a version, risk, public label and reviewer checks.');
    const version = own(input, 'version');
    const risk = own(input, 'risk');
    const publicLabel = own(input, 'publicLabel');
    const supplied = own(input, 'reviews');
    if (!versionIsValid(version)) return problem('use a whole version of 1 or more.');
    if (!risks.includes(risk)) return problem('choose low, medium or high risk.');
    if (typeof publicLabel !== 'string') return problem('write the public label as text.');
    if (!plain(supplied)) return problem('include one check for every reviewer.');
    if (Object.keys(supplied).some(key => !(REVIEWERS as readonly string[]).includes(key))) {
      return problem('use only the eight named reviewers.');
    }
    const reviews = {} as Record<Reviewer, ReviewResult>;
    for (const reviewer of REVIEWERS) {
      const result = own(supplied, reviewer);
      if (!results.includes(result)) return problem('give every reviewer a pass, fail or pending check.');
      reviews[reviewer] = result as ReviewResult;
    }
    return { ok: true, row: { version, risk: risk as RiskLevel, publicLabel, reviews } };
  } catch {
    return problem('use a plain review row that can be read.');
  }
}

/** Even an unchanged label or an empty edit is a new version and invalidates every earlier review. */
export function editItem(input: unknown, changes: unknown): CheckedRow {
  const checked = validateRow(input);
  if (!checked.ok) return checked;
  try {
    if (!plain(changes) || Object.keys(changes).some(key => !['risk', 'publicLabel'].includes(key))) {
      return problem('edit only the risk or public label.');
    }
    const { row } = checked;
    if (row.version === Number.MAX_SAFE_INTEGER) return problem('this version cannot be increased safely.');
    const risk = Object.hasOwn(changes, 'risk') ? own(changes, 'risk') : row.risk;
    const publicLabel = Object.hasOwn(changes, 'publicLabel') ? own(changes, 'publicLabel') : row.publicLabel;
    if (!risks.includes(risk)) return problem('choose low, medium or high risk.');
    if (typeof publicLabel !== 'string') return problem('write the public label as text.');
    return {
      ok: true,
      row: {
        version: row.version + 1, risk: risk as RiskLevel, publicLabel,
        reviews: Object.fromEntries(REVIEWERS.map(reviewer => [reviewer, 'pending'])) as ReviewRow['reviews'],
      },
    };
  } catch {
    return problem('use plain changes that can be read.');
  }
}

export function setResult(input: unknown, reviewer: unknown, result: unknown, version: unknown): CheckedRow {
  const checked = validateRow(input);
  if (!checked.ok) return checked;
  if (typeof reviewer !== 'string' || !(REVIEWERS as readonly string[]).includes(reviewer)) {
    return problem('choose one of the eight named reviewers.');
  }
  if (!results.includes(result)) return problem('choose pass, fail or pending.');
  if (!versionIsValid(version)) return problem('use a whole version of 1 or more.');
  if (version !== checked.row.version) return problem('this result is for a different version. review the current version.');
  return { ok: true, row: { ...checked.row, reviews: { ...checked.row.reviews, [reviewer]: result as ReviewResult } } };
}

/** Always a boolean: invalid data must never become a truthy error at a publish gate. */
export function readyToPublish(input: unknown): boolean {
  const checked = validateRow(input);
  return checked.ok && REVIEWERS.every(reviewer => checked.row.reviews[reviewer] === 'pass');
}

export function summary(input: unknown): string {
  try {
    if (!Array.isArray(input)) return 'use a list of review rows.';
    let ready = 0;
    let waiting = 0;
    let failed = 0;
    for (let index = 0; index < input.length; index++) {
      const checked = validateRow(own(input, String(index)));
      if (!checked.ok) return `row ${index + 1}: ${checked.message}`;
      const checks = REVIEWERS.map(reviewer => checked.row.reviews[reviewer]);
      if (checks.every(result => result === 'pass')) ready++;
      else if (checks.includes('fail')) failed++;
      else waiting++;
    }
    return `${ready} ready, ${waiting} waiting on reviews, ${failed} failed`;
  } catch {
    return 'use a plain list of review rows that can be read.';
  }
}
