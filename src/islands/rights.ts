/** Asset eligibility from the validation fields of public.rights_records (D-84). */
export interface RightsRecord {
  asset: string;
  holder: string;
  license: string;
  evidence_url: string;
  verified: boolean;
  /** An ISO timestamp with a zone, as returned by the database, or null. */
  verified_at: string | null;
}

const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
// PostgreSQL's UTF-8 [:space:] and [:cntrl:] classes; unlike JS \s, these allow nonbreaking spaces and BOM.
const EVIDENCE_GAP = /[\u0000-\u0020\u007f-\u009f\u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]/;
const own = (value: object, key: string): unknown => {
  const property = Object.getOwnPropertyDescriptor(value, key);
  return property && 'value' in property ? property.value : undefined;
};

/** Compare database timestamps without losing their final three microsecond digits. */
function timestamp(value: unknown): bigint | undefined {
  if (typeof value !== 'string') return;
  const parts = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts || parts[1].startsWith('0000') || Number(parts[2]) > 23 || Number(parts[3]) > 59 || Number(parts[4]) > 59) return;
  const day = Date.parse(`${parts[1]}T00:00:00.000Z`);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(day) || !Number.isFinite(milliseconds) || new Date(day).toISOString().slice(0, 10) !== parts[1]) return;
  return BigInt(milliseconds) * 1_000n + BigInt((parts[5] ?? '').padEnd(6, '0').slice(3));
}

/** Plain-word checks for the migration's text and verification constraints. No input is trimmed or changed. */
export function rightsProblems(record: unknown, now: string | Date): string[] {
  const problems: string[] = [];
  const current = now instanceof Date
    ? (Number.isFinite(now.getTime()) ? BigInt(now.getTime()) * 1_000n : undefined)
    : timestamp(now);
  if (current === undefined) problems.push('the current time must be a valid timestamp.');
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    return [...problems, 'a rights record is required.'];
  }
  for (const [field, maximum] of [['asset', 500], ['holder', 200], ['license', 100]] as const) {
    const value = own(record, field);
    if (typeof value !== 'string') {
      problems.push(`the ${field} must be text.`);
      continue;
    }
    if ([...value].length < 1 || [...value].length > maximum) {
      problems.push(`the ${field} must have 1 to ${maximum} characters.`);
    }
    if (CONTROL.test(value)) problems.push(`the ${field} cannot contain control characters.`);
  }
  const evidence = own(record, 'evidence_url');
  if (typeof evidence !== 'string' || !evidence.startsWith('https://') || evidence.length === 8 ||
      [...evidence].length > 500 || EVIDENCE_GAP.test(evidence)) {
    problems.push('the evidence link must start with https://, have no spaces or control characters, and use at most 500 characters.');
  }
  const verified = own(record, 'verified');
  const when = own(record, 'verified_at');
  if (typeof verified !== 'boolean') problems.push('verified must be true or false.');
  else if (verified !== (when !== null)) problems.push('a verified record needs a verification date, and an unverified one must have no date.');
  if (when !== null) {
    const time = timestamp(when);
    if (time === undefined) problems.push('the verification date must be a valid timestamp.');
    // The SQL check allows one minute of clock skew. Task 41 expressly asks for no future date, so this is stricter.
    else if (current !== undefined && time > current) problems.push('the verification date cannot be in the future.');
  }
  return problems;
}

/** One valid verified record suffices. Emit each exact asset once, in the input order; never infer a match. */
export function usableAssets(assets: readonly string[], records: readonly RightsRecord[], now: string | Date): string[] {
  const usable = new Set<string>();
  for (const record of records) {
    if (rightsProblems(record, now).length === 0 && own(record, 'verified') === true) {
      usable.add(own(record, 'asset') as string);
    }
  }
  const seen = new Set<string>();
  return assets.filter(asset => {
    if (!usable.has(asset) || seen.has(asset)) return false;
    seen.add(asset);
    return true;
  });
}
