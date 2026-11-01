import { describe, expect, it } from 'vitest';
import { parseRows } from '../../scripts/check-batch/csv';
import { exportCsv, exportJson, type ExportData } from '../../src/islands/exportdata';
import { emptyProgress, readProgress, saveProgress, withOnboarding, withPile, withStars } from '../../src/scripts/progress';
import { loadStats, STATS_STORAGE_KEY } from '../../src/islands/gameresults';
import { serialize } from '../../src/islands/gamestats';

const exportDate = '2026-11-01T08:00:00.000Z';
const sample = {
  profile: { displayName: 'Sample Student', email: 'sample@example.invalid', createdAt: '2026-10-01T12:00:00.000Z' },
  onboarding: { course: 'fundamentals', examDate: '2026-12-01', done: true, school: 'Sample School' },
  progress: [{ id: 'sample-item', result: true, date: '2026-10-31' }],
  reviewState: [{ id: 'sample-card', nextDueDate: '2026-11-03', interval: 3 }],
  gameStats: [{ game: 'pulse', day: '2026-10-31', solved: false, tries: 7 }],
} satisfies ExportData;
const json = (data: unknown) => JSON.parse(exportJson(data, exportDate));
const file = (data: unknown, name: string) => exportCsv(data).find(entry => entry.fileName === `${name}.csv`)!.text;

function sampleStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}
function sampleGuest() {
  const setup = withOnboarding(emptyProgress(), { course: 'fundamentals', examDate: '2026-12-01' });
  const known = withPile(setup, 'sample-deck', 'sample-card-a', 'know');
  const learning = withPile(known, 'sample-deck', 'sample-card-b', 'learning');
  return withStars(learning, 'sample-deck', ['sample-card-a', 'sample-card-c']);
}

describe('JSON export', () => {
  it('round-trips every allowed sample section with a caller-supplied date and format', () => {
    expect(json(sample)).toEqual({ format: 'cueory-export-1', exportDate, ...sample, attempts: [], examPlans: [], reviewRows: [], dropped: [] });
    expect(exportJson(sample, exportDate)).toContain('\n  "profile": {\n    "displayName": "Sample Student",');
  });

  it('includes the account email as personal data in JSON and CSV', () => {
    expect(json(sample).profile.email).toBe('sample@example.invalid');
    expect(parseRows(file(sample, 'profile'))).toEqual([
      ['displayName', 'email', 'createdAt'], ['Sample Student', 'sample@example.invalid', '2026-10-01T12:00:00.000Z'],
    ]);
    expect(json({ profile: { email: null } }).profile).toEqual({ email: null });
  });

  it.each([
    ['2026-11-01T08:00:00+00:00', '2026-11-01T08:00:00.000Z'],
    ['2026-11-01T13:30:00+05:30', '2026-11-01T08:00:00.000Z'],
    ['2026-11-01T01:00:00-07:00', '2026-11-01T08:00:00.000Z'],
    ['2026-11-01T00:15:00+01:00', '2026-10-31T23:15:00.000Z'],
    ['2026-12-31T23:30:00-01:00', '2027-01-01T00:30:00.000Z'],
    ['2026-11-01T13:30:00.123456+05:30', '2026-11-01T08:00:00.123456Z'],
    ['2026-11-01T08:00:00.000001Z', '2026-11-01T08:00:00.000001Z'],
    ['2026-11-01T08:00:00.123450+00:00', '2026-11-01T08:00:00.12345Z'],
  ])('normalizes Postgres timestamp %s to UTC without losing microseconds', (date, expected) => {
    const input = { profile: { createdAt: date }, progress: [{ id: 'sample-item', result: true, date }] };
    expect(json(input).profile.createdAt).toBe(expected);
    expect(json(input).progress[0].date).toBe(expected);
    expect(parseRows(file(input, 'profile'))[1][2]).toBe(expected);
    expect(JSON.parse(exportJson({}, date)).exportDate).toBe(expected);
  });

  it.each(['2026-02-30T08:00:00+00:00', '2026-11-01T24:00:00Z', '2026-11-01T08:60:00Z', '2026-11-01T08:00:00+24:00', '2026-11-01T08:00:00.1234567Z'])('reports malformed timestamp %s by field, without its value', createdAt => {
    const result = json({ profile: { createdAt } });
    expect(result.profile).toEqual({});
    expect(result.dropped).toEqual(['profile.createdAt']);
    expect(JSON.stringify(result)).not.toContain(createdAt);
  });

  it('round-trips the actual persisted guest record, including every pile, star and setup answer', () => {
    const storage = sampleStorage();
    expect(saveProgress(storage, sampleGuest())).toBe(true);
    const stored = readProgress(storage);
    expect(json({ progress: stored }).progress).toEqual(stored);
    expect(json({ progress: stored }).dropped).toEqual([]);
    const rows = parseRows(file({ progress: stored }, 'progress'));
    expect(rows[0]).toEqual(['id', 'result', 'date', 'deckId', 'progressVersion', 'course', 'examDate', 'done']);
    expect(rows.slice(1).map(row => row.slice(0, 4))).toEqual([
      ['sample-card-a', 'know', '', 'sample-deck'], ['sample-card-b', 'learning', '', 'sample-deck'],
      ['sample-card-a', 'starred', '', 'sample-deck'], ['sample-card-c', 'starred', '', 'sample-deck'],
    ]);
    expect(rows.slice(1).every(row => JSON.stringify(row.slice(4)) === JSON.stringify(['1', 'fundamentals', '2026-12-01', 'true']))).toBe(true);
  });

  it('retains empty/absent-answer guest state and empty decks without fabricating card dates', () => {
    const empty = emptyProgress();
    expect(json({ progress: empty }).progress).toEqual(empty);
    expect(parseRows(file({ progress: empty }, 'progress'))[1]).toEqual(['', '', '', '', '1', '', '', 'false']);
    const withEmptyDeck = { ...empty, decks: { 'sample-empty': { know: [], learning: [], starred: [] } } };
    expect(json({ progress: withEmptyDeck }).progress).toEqual(withEmptyDeck);
    expect(parseRows(file({ progress: withEmptyDeck }, 'progress'))[1][3]).toBe('sample-empty');
  });

  it('orders guest deck fields consistently and exports cards for decks no longer shown', () => {
    const a = { know: ['sample-a'], learning: [], starred: [] };
    const b = { know: [], learning: ['sample-b'], starred: [] };
    const guest = { ...sampleGuest(), decks: { 'sample-z': a, 'sample-removed': b } };
    const reordered = { decks: { 'sample-removed': b, 'sample-z': a }, onboarding: guest.onboarding, version: guest.version };
    expect(exportJson({ progress: guest }, exportDate)).toBe(exportJson({ progress: reordered }, exportDate));
    expect(json({ progress: guest }).progress.decks['sample-removed'].learning).toEqual(['sample-b']);
  });

  it('drops unknown guest fields and bad card entries by path while keeping the valid saved data', () => {
    const hidden = 'sample: discarded private value';
    const guest = sampleGuest();
    const input = { progress: {
      ...guest, private: hidden, onboarding: { ...guest.onboarding, private: hidden },
      decks: { 'sample-deck': { ...guest.decks['sample-deck'], private: hidden, know: ['sample-card-a', { private: hidden }] } },
    } };
    const result = json(input);
    expect(result.progress.decks['sample-deck'].know).toEqual(['sample-card-a']);
    expect(result.dropped).toEqual(['progress.decks.sample-deck.know[1]', 'progress.decks.sample-deck.private', 'progress.onboarding.private', 'progress.private']);
    expect(exportJson(input, exportDate)).not.toContain(hidden);
    expect(exportCsv(input).map(entry => entry.text).join('')).not.toContain(hidden);
    expect(json({ progress: { ...guest, version: 2 } }).dropped).toEqual(['progress', 'progress.version']);
  });

  it('does not mutate or share nested guest cards with the download', () => {
    const guest = sampleGuest();
    const before = structuredClone(guest);
    Object.values(guest.decks).forEach(deck => { Object.values(deck).forEach(Object.freeze); Object.freeze(deck); });
    Object.freeze(guest.decks); Object.freeze(guest.onboarding); Object.freeze(guest);
    const result = json({ progress: guest });
    result.progress.decks['sample-deck'].know.push('sample-change');
    exportCsv({ progress: guest });
    expect(guest).toEqual(before);
  });

  it('takes game history from the browser record without fetching it', () => {
    const storage = sampleStorage();
    storage.setItem(STATS_STORAGE_KEY, serialize(sample.gameStats));
    const gameStats = loadStats(storage, '2026-11-01').stats;
    expect(json({ gameStats }).gameStats).toEqual(sample.gameStats);
  });

  it('uses fixed field order regardless of the input property order', () => {
    const reordered = {
      gameStats: [{ tries: 7, solved: false, day: '2026-10-31', game: 'pulse' }],
      reviewState: [{ interval: 3, nextDueDate: '2026-11-03', id: 'sample-card' }],
      progress: [{ date: '2026-10-31', result: true, id: 'sample-item' }],
      onboarding: { school: 'Sample School', done: true, examDate: '2026-12-01', course: 'fundamentals' },
      profile: { createdAt: '2026-10-01T12:00:00.000Z', email: 'sample@example.invalid', displayName: 'Sample Student' },
    };
    expect(exportJson(reordered, exportDate)).toBe(exportJson(sample, exportDate));
    expect(Object.keys(json(sample))).toEqual(['format', 'exportDate', 'profile', 'onboarding', 'progress', 'reviewState', 'gameStats', 'attempts', 'examPlans', 'reviewRows', 'dropped']);
  });

  it('preserves attempt and history row order, false, zero, null and Unicode', () => {
    const input = {
      ...sample,
      profile: { displayName: 'Sample: 王 👩🏽‍⚕️', createdAt: null },
      onboarding: { course: null, examDate: null, done: false, school: null },
      progress: [sample.progress![0], { id: 'sample-other', result: 'learning', date: '2026-10-30' }],
      reviewState: [{ id: 'sample-card', nextDueDate: '2026-11-03', interval: 0 }],
      gameStats: [{ game: 'triage', day: '2026-10-31', solved: false, tries: 0 }],
    };
    const result = json(input);
    for (const section of Object.keys(input)) expect(result[section]).toEqual(input[section as keyof typeof input]);
  });

  it('makes empty sections explicit without inventing profile values or records', () => {
    expect(json({})).toEqual({
      format: 'cueory-export-1', exportDate, profile: {}, onboarding: {}, progress: [], reviewState: [], gameStats: [], attempts: [], examPlans: [], reviewRows: [], dropped: [],
    });
  });

  it('drops unknown fields at every depth and reports only sorted field paths', () => {
    const hidden = 'sample: discarded private value';
    const input = {
      ...sample, extra: { hidden },
      profile: { ...sample.profile, phoneNumber: hidden },
      onboarding: { ...sample.onboarding, tracking: hidden },
      progress: [{ ...sample.progress![0], rationale: hidden }],
      reviewState: [{ ...sample.reviewState![0], otherStudent: hidden }],
      gameStats: [{ ...sample.gameStats![0], fingerprint: hidden }],
    };
    expect(json(input)).toEqual({ ...json(sample), dropped: [
      'extra', 'gameStats[0].fingerprint', 'onboarding.tracking', 'profile.phoneNumber', 'progress[0].rationale', 'reviewState[0].otherStudent',
    ] });
    expect(exportJson(input, exportDate)).not.toContain(hidden);
    expect(exportCsv(input).map(entry => entry.text).join('')).not.toContain(hidden);
  });

  it('never executes getters or toJSON hooks, including unknown cyclic metadata', () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const profile = { displayName: 'Sample Student', toJSON: () => { throw new Error('must not execute'); } };
    Object.defineProperty(profile, 'private', { enumerable: true, get: () => { throw new Error('must not read'); } });
    const result = json({ profile, metadata: cycle });
    expect(result.profile).toEqual({ displayName: 'Sample Student' });
    expect(result.dropped).toEqual(['metadata', 'profile.private', 'profile.toJSON']);
    const withAccessor = Object.defineProperty({}, 'displayName', { enumerable: true, get: () => { throw new Error('must not read'); } });
    expect(json({ profile: withAccessor }).dropped).toEqual(['profile.displayName']);
  });

  it('copies only own properties from plain objects, including null-prototype data', () => {
    const profile = Object.assign(Object.create(null), { displayName: 'Sample Student' });
    expect(json({ profile }).profile).toEqual({ displayName: 'Sample Student' });
    expect(json({ profile: Object.create({ displayName: 'Sample Inherited' }) }).dropped).toEqual(['profile']);
    expect(json(JSON.parse('{"profile":{"__proto__":{"sample":"discarded"}}}')).dropped).toEqual(['profile.__proto__']);
  });

  it.each([null, [], 'sample: wrong shape', 1])('refuses a non-object sample input %j', input => {
    expect(json(input)).toEqual({ ...json({}), dropped: ['input'] });
  });

  it('drops wrong known-field types instead of copying arbitrary objects', () => {
    const result = json({
      profile: { displayName: { private: 'sample: hidden' }, createdAt: 'bad date' },
      onboarding: { course: [], examDate: '2026-02-30', done: 'true', school: 123 },
      progress: [{ id: 'sample-item', result: {}, date: '2026-10-31' }],
      reviewState: [{ id: 'sample-card', nextDueDate: '2026-11-01', interval: -1 }],
      gameStats: [{ game: 'sample: unknown', day: '2026-10-31', solved: false, tries: 1 }],
    });
    expect(result.profile).toEqual({});
    expect(result.onboarding).toEqual({});
    expect(result.progress).toEqual([]);
    expect(result.reviewState).toEqual([]);
    expect(result.gameStats).toEqual([]);
    expect(result.dropped).toEqual([
      'gameStats[0]', 'gameStats[0].game', 'onboarding.course', 'onboarding.done', 'onboarding.examDate', 'onboarding.school',
      'profile.createdAt', 'profile.displayName', 'progress[0]', 'progress[0].result', 'reviewState[0]', 'reviewState[0].interval',
    ]);
  });

  it('reports incomplete or malformed rows and sections without fabricating records', () => {
    expect(json({ progress: [{ id: 'sample-item' }, null], reviewState: {}, gameStats: 'sample: invalid' }).dropped)
      .toEqual(['gameStats', 'progress[0]', 'progress[0].date', 'progress[0].result', 'progress[1]', 'reviewState']);
    const results = Object.assign([...sample.gameStats!], { metadata: 'sample: hidden' });
    expect(json({ gameStats: results }).gameStats).toEqual(sample.gameStats);
    expect(json({ gameStats: results }).dropped).toEqual(['gameStats.metadata']);
    Object.defineProperty(results, '4294967295', { value: 'sample: metadata outside array indexes', enumerable: true });
    expect(json({ gameStats: results }).dropped).toEqual(['gameStats.4294967295', 'gameStats.metadata']);
  });

  it('never trims or deduplicates valid sample history during a download', () => {
    const games = [
      { game: 'pulse', day: '2020-01-01', solved: true, tries: 1 },
      ...sample.gameStats!, ...sample.gameStats!,
    ];
    expect(json({ gameStats: games }).gameStats).toEqual(games);
  });

  it('does not mutate input or share arrays with the parsed download', () => {
    const input = structuredClone(sample);
    Object.freeze(input.profile);
    Object.freeze(input.onboarding);
    for (const rows of [input.progress!, input.reviewState!, input.gameStats!]) { rows.forEach(Object.freeze); Object.freeze(rows); }
    Object.freeze(input);
    const result = json(input);
    result.progress[0].id = 'sample: changed';
    result.gameStats.pop();
    exportCsv(input);
    expect(input).toEqual(sample);
  });

  it.each([
    ['2026-11-01', '2026-11-01'],
    ['2026-11-01T08:00:00Z', exportDate],
    [exportDate, exportDate],
  ])('uses the supplied export date %s, normalizing times to UTC', (date, normalized) => {
    expect(JSON.parse(exportJson({}, date)).exportDate).toBe(normalized);
  });
  it.each(['', '2026-02-30', 'sample: tomorrow', '0000-01-01'])('refuses an unusable export date %s without consulting a clock', date => {
    expect(() => exportJson({}, date)).toThrow('pass the export date as a real day or an ISO date and time.');
  });
});

describe('CSV export', () => {
  it('returns section files in fixed order with RFC 4180 record endings', () => {
    const files = exportCsv(sample);
    expect(files.map(entry => entry.fileName)).toEqual(['profile.csv', 'onboarding.csv', 'progress.csv', 'reviewState.csv', 'gameStats.csv', 'attempts.csv', 'examPlans.csv', 'reviewRows.csv', 'dropped.csv']);
    expect(files.every(entry => entry.text.endsWith('\r\n'))).toBe(true);
    expect(parseRows(file(sample, 'progress'))).toEqual([
      ['id', 'result', 'date', 'deckId', 'progressVersion', 'course', 'examDate', 'done'],
      ['sample-item', 'true', '2026-10-31', '', '', '', '', ''],
    ]);
    expect(parseRows(file(sample, 'gameStats'))).toEqual([['game', 'day', 'solved', 'tries'], ['pulse', '2026-10-31', 'false', '7']]);
  });

  it('preserves sample commas, quotes, Unicode and embedded LF/CRLF after parsing', () => {
    const displayName = 'Sample: "Ána", 王\nnext line\r\nlast line';
    const school = 'Sample: "School", East';
    const input = { profile: { displayName }, onboarding: { school } };
    expect(file(input, 'profile')).toContain('"Sample: ""Ána"", 王\nnext line\r\nlast line"');
    expect(parseRows(file(input, 'profile'))[1]).toEqual([displayName, '', '']);
    expect(parseRows(file(input, 'onboarding'))[1]).toEqual(['', '', '', school]);
  });

  it.each(['=1+1', '+1+1', '-1+1', '@sample', '\tsample', '\rsample', '\n=1+1'])('quotes formula-like sample cells as text: %j', value => {
    const input = {
      profile: { displayName: value, email: value }, onboarding: { course: value, school: value },
      progress: [{ id: value, result: value, date: '2026-10-31' }],
      reviewState: [{ id: value, nextDueDate: '2026-11-01', interval: 0 }],
      [value]: 'sample: private discarded value',
    };
    expect(parseRows(file(input, 'profile'))[1][0]).toBe(`'${value}`);
    expect(parseRows(file(input, 'profile'))[1][1]).toBe(`'${value}`);
    expect(parseRows(file(input, 'onboarding'))[1]).toEqual([`'${value}`, '', '', `'${value}`]);
    expect(parseRows(file(input, 'progress'))[1].slice(0, 2)).toEqual([`'${value}`, `'${value}`]);
    expect(parseRows(file(input, 'reviewState'))[1][0]).toBe(`'${value}`);
    expect(parseRows(file(input, 'dropped'))[1][0]).toBe(`'${value}`);
    // The lossless JSON remains exactly what the student supplied.
    expect(json(input).profile.displayName).toBe(value);
  });

  it('leaves ordinary sample punctuation alone, including existing apostrophes', () => {
    for (const value of ["'sample", 'sample: one + two', ' Sample Student ', 'sample@example.invalid']) {
      expect(parseRows(file({ profile: { displayName: value } }, 'profile'))[1][0]).toBe(value);
    }
  });

  it('includes only headers for empty sections and the empty dropped report', () => {
    const files = exportCsv({});
    expect(files).toHaveLength(9);
    expect(files.every(entry => parseRows(entry.text).length === 1)).toBe(true);
    expect(files[8]).toEqual({ fileName: 'dropped.csv', text: 'dropped\r\n' });
  });

  it('returns fresh files and the same stable output for repeated exports', () => {
    const first = exportCsv(sample);
    const second = exportCsv(sample);
    expect(first).toEqual(second);
    first[0].text = 'sample: changed';
    expect(exportCsv(sample)).toEqual(second);
  });
});

const id1 = '00000000-0000-4000-8000-000000000000';
const id2 = '00000000-0000-4000-8000-000000000001';
const account = {
  attempts: [{ itemVersionId: id1, picked: ['a', 'c'], correct: false, createdAt: '2026-11-01T01:00:00-07:00' }],
  examPlans: [{ course: 'med-surg-1', examDate: '2026-12-15', createdAt: '2026-10-31T12:00:00.5+00:00' }],
  reviewRows: [{ itemId: id2, level: 3, lastReviewed: '2026-10-30', nextReview: '2026-11-13' }],
};

describe('account study progress sections', () => {
  it('exports attempts, exam plans and review rows in fixed order with UTC timestamps', () => {
    const result = json(account);
    expect(result.attempts).toEqual([{ itemVersionId: id1, picked: ['a', 'c'], correct: false, createdAt: '2026-11-01T08:00:00.000Z' }]);
    expect(result.examPlans).toEqual([{ course: 'med-surg-1', examDate: '2026-12-15', createdAt: '2026-10-31T12:00:00.500Z' }]);
    expect(result.reviewRows).toEqual(account.reviewRows);
    expect(result.dropped).toEqual([]);
    const reordered = { reviewRows: [{ nextReview: '2026-11-13', lastReviewed: '2026-10-30', level: 3, itemId: id2 }], attempts: [{ createdAt: account.attempts[0].createdAt, correct: false, picked: ['a', 'c'], itemVersionId: id1 }], examPlans: account.examPlans };
    expect(exportJson(reordered, exportDate)).toBe(exportJson(account, exportDate));
  });

  it('keeps the guest reviewState section separate from reviewRows', () => {
    const result = json({ ...account, reviewState: sample.reviewState });
    expect(result.reviewState).toEqual(sample.reviewState);
    expect(result.reviewRows).toEqual(account.reviewRows);
  });

  it('writes a CSV file per section, joining picked letters and keeping row order', () => {
    expect(parseRows(file(account, 'attempts'))).toEqual([
      ['itemVersionId', 'picked', 'correct', 'createdAt'], [id1, 'a;c', 'false', '2026-11-01T08:00:00.000Z'],
    ]);
    expect(parseRows(file(account, 'examPlans'))).toEqual([['course', 'examDate', 'createdAt'], ['med-surg-1', '2026-12-15', '2026-10-31T12:00:00.500Z']]);
    expect(parseRows(file(account, 'reviewRows'))).toEqual([['itemId', 'level', 'lastReviewed', 'nextReview'], [id2, '3', '2026-10-30', '2026-11-13']]);
    expect(file(account, 'attempts').endsWith('\r\n')).toBe(true);
  });

  it.each([
    ['uppercase', '00000000-0000-4000-8000-00000000000A'],
    ['too short', '00000000-0000-4000-8000-00000000000'],
    ['not hex', '0000000g-0000-4000-8000-000000000000'],
    ['no dashes', '00000000000040008000000000000000'],
    ['bad variant', '00000000-0000-4000-c000-000000000000'],
    ['padded', ` ${id1}`],
    ['formula', '=1+1'],
  ])('rejects a %s uuid by field and row, never by value', (_name, bad) => {
    const result = json({ attempts: [{ ...account.attempts[0], itemVersionId: bad }], reviewRows: [{ ...account.reviewRows[0], itemId: bad }] });
    expect(result.attempts).toEqual([]);
    expect(result.reviewRows).toEqual([]);
    expect(result.dropped).toEqual(['attempts[0]', 'attempts[0].itemVersionId', 'reviewRows[0]', 'reviewRows[0].itemId']);
    expect(JSON.stringify(result)).not.toContain(bad.trim() || 'x');
  });

  it.each([[[]], [['f']], [['A']], [['a', 'a']], [['a', 'b', 'c', 'd', 'e', 'a']], [['ab']], [[1]], ['a'], [null], [{ 0: 'a', length: 1 }], [[undefined]]])('rejects invalid picked %j', picked => {
    const result = json({ attempts: [{ ...account.attempts[0], picked }, account.attempts[0]] });
    expect(result.attempts).toHaveLength(1);
    expect(result.dropped).toEqual(['attempts[0]', 'attempts[0].picked']);
  });

  it('accepts one to five distinct letters in the order given', () => {
    for (const picked of [['e'], ['d', 'b'], ['a', 'b', 'c', 'd', 'e']]) {
      expect(json({ attempts: [{ ...account.attempts[0], picked }] }).attempts[0].picked).toEqual(picked);
    }
  });

  it('never runs a getter inside picked and refuses sparse or decorated arrays', () => {
    const getter: string[] = [];
    Object.defineProperty(getter, '0', { enumerable: true, get: () => { throw new Error('must not read'); } });
    const sparse = ['a']; sparse.length = 2;
    const decorated = Object.assign(['a'], { extra: 'b' });
    for (const picked of [getter, sparse, decorated]) {
      expect(json({ attempts: [{ ...account.attempts[0], picked }] }).dropped).toEqual(['attempts[0]', 'attempts[0].picked']);
    }
  });

  it('does not share or mutate the picked array', () => {
    const input = structuredClone(account);
    Object.freeze(input.attempts[0].picked);
    const result = json(input);
    result.attempts[0].picked.push('e');
    expect(input.attempts[0].picked).toEqual(['a', 'c']);
  });

  it.each(['correct', 'createdAt'])('rejects a bad attempts %s and reports it with its row', field => {
    const bad = { ...account.attempts[0], [field]: field === 'correct' ? 'yes' : '2026-02-30T00:00:00Z' };
    const result = json({ attempts: [account.attempts[0], bad] });
    expect(result.attempts).toHaveLength(1);
    expect(result.dropped).toEqual(['attempts[1]', `attempts[1].${field}`]);
  });

  it('reports a missing attempts field and row', () => {
    expect(json({ attempts: [{ itemVersionId: id1 }] }).dropped).toEqual(['attempts[0]', 'attempts[0].correct', 'attempts[0].createdAt', 'attempts[0].picked']);
  });

  it.each([
    ['uppercase', 'Med-Surg'], ['leading hyphen', '-med'], ['trailing hyphen', 'med-'], ['double hyphen', 'med--surg'],
    ['space', 'med surg'], ['empty', ''], ['too long', 'a'.repeat(81)], ['formula', '=cmd'], ['number', 5],
  ])('rejects a %s course', (_name, course) => {
    const result = json({ examPlans: [{ ...account.examPlans[0], course }] });
    expect(result.examPlans).toEqual([]);
    expect(result.dropped).toEqual(['examPlans[0]', 'examPlans[0].course']);
  });

  it('accepts a course of exactly 80 characters and a single word', () => {
    for (const course of ['a'.repeat(80), 'fundamentals']) expect(json({ examPlans: [{ ...account.examPlans[0], course }] }).examPlans[0].course).toBe(course);
  });

  it.each(['2026-02-30', '2026-13-01', '12/15/2026', '2026-12-15T00:00:00Z', null, 20261215])('rejects exam date %j', examDate => {
    expect(json({ examPlans: [{ ...account.examPlans[0], examDate }] }).dropped).toEqual(['examPlans[0]', 'examPlans[0].examDate']);
  });

  it.each([-1, 4, 1.5, '2', null, NaN, Infinity])('rejects review level %j', badLevel => {
    expect(json({ reviewRows: [{ ...account.reviewRows[0], level: badLevel }] }).dropped).toEqual(['reviewRows[0]', 'reviewRows[0].level']);
  });
  it.each([0, 1, 2, 3])('accepts review level %i', okLevel => {
    expect(json({ reviewRows: [{ ...account.reviewRows[0], level: okLevel }] }).reviewRows[0].level).toBe(okLevel);
  });
  it('rejects bad review days by field and row', () => {
    const result = json({ reviewRows: [{ ...account.reviewRows[0], lastReviewed: '2026-02-30', nextReview: 'soon' }] });
    expect(result.dropped).toEqual(['reviewRows[0]', 'reviewRows[0].lastReviewed', 'reviewRows[0].nextReview']);
  });

  it('drops unknown fields such as userId, rationale and key by name only', () => {
    const hidden = 'sample: discarded private value';
    const input = {
      attempts: [{ ...account.attempts[0], userId: hidden, rationale: hidden, key: hidden }],
      examPlans: [{ ...account.examPlans[0], userId: hidden, id: hidden }],
      reviewRows: [{ ...account.reviewRows[0], userId: hidden, updatedAt: hidden }],
    };
    const result = json(input);
    expect(result.dropped).toEqual([
      'attempts[0].key', 'attempts[0].rationale', 'attempts[0].userId', 'examPlans[0].id', 'examPlans[0].userId',
      'reviewRows[0].updatedAt', 'reviewRows[0].userId',
    ]);
    expect({ ...result, dropped: [] }).toEqual({ ...json(account), dropped: [] });
    const everything = exportJson(input, exportDate) + exportCsv(input).map(entry => entry.text).join('');
    expect(everything).not.toContain(hidden);
  });

  it('neutralises formulas in every new CSV cell, and refuses them as values', () => {
    // A valid course or letter can never start with a formula character, so formulas are refused at validation...
    const formula = '=HYPERLINK("http://example.invalid")';
    const bad = { attempts: [{ ...account.attempts[0], picked: [formula] }], examPlans: [{ ...account.examPlans[0], course: formula }] };
    expect(file(bad, 'attempts')).toBe('itemVersionId,picked,correct,createdAt\r\n');
    expect(file(bad, 'examPlans')).toBe('course,examDate,createdAt\r\n');
    expect(exportCsv(bad).map(entry => entry.text).join('')).not.toContain('HYPERLINK');
    // ...and unknown section names that start with one are neutralised in the dropped report.
    for (const lead of ['=', '+', '-', '@', '\t', '\r', '\n']) {
      const rows = parseRows(file({ ...account, [`${lead}cmd`]: 'x' }, 'dropped'));
      expect(rows).toEqual([['dropped'], [`'${lead}cmd`]]);
    }
  });

  it('caps examPlans at 10 rows and reports the rest without reading it', () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({ ...account.examPlans[0], course: `course-${index}`, userId: 'x' }));
    const result = json({ examPlans: rows });
    expect(result.examPlans.map((row: { course: string }) => row.course)).toEqual(rows.slice(0, 10).map(row => row.course));
    expect(result.dropped).toContain('examPlans[10+]');
    expect(json({ examPlans: rows.slice(0, 10) }).dropped).not.toContain('examPlans[10+]');
  });

  it.each([['attempts', account.attempts[0]], ['reviewRows', account.reviewRows[0]]])('caps %s at 50,000 rows and reports truncation', (section, row) => {
    const exact = Array.from({ length: 50_000 }, () => row);
    expect(json({ [section]: exact })[section]).toHaveLength(50_000);
    expect(json({ [section]: exact }).dropped).toEqual([]);
    const over = [...exact, row, row];
    const result = json({ [section]: over });
    expect(result[section]).toHaveLength(50_000);
    expect(result.dropped).toEqual([`${section}[50000+]`]);
    expect(parseRows(file({ [section]: over }, section))).toHaveLength(50_001);
  });

  it('refuses non-array account sections without fabricating rows', () => {
    expect(json({ attempts: {}, examPlans: 'x', reviewRows: null }).dropped).toEqual(['attempts', 'examPlans', 'reviewRows']);
  });
});
