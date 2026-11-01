import { describe, expect, it } from 'vitest';
import { parseRows } from '../../scripts/check-batch/csv';
import { exportCsv, exportJson, type ExportData } from '../../src/islands/exportdata';

const exportDate = '2026-11-01T08:00:00.000Z';
const sample: ExportData = {
  profile: { displayName: 'Sample Student', createdAt: '2026-10-01T12:00:00Z' },
  onboarding: { course: 'fundamentals', examDate: '2026-12-01', done: true, school: 'Sample School' },
  progress: [{ id: 'sample-item', result: true, date: '2026-10-31' }],
  reviewState: [{ id: 'sample-card', nextDueDate: '2026-11-03', interval: 3 }],
  gameStats: [{ game: 'pulse', day: '2026-10-31', solved: false, tries: 7 }],
};
const json = (data: unknown) => JSON.parse(exportJson(data, exportDate));
const file = (data: unknown, name: string) => exportCsv(data).find(entry => entry.fileName === `${name}.csv`)!.text;

describe('JSON export', () => {
  it('round-trips every allowed sample section with a caller-supplied date and format', () => {
    expect(json(sample)).toEqual({ format: 'cueory-export-1', exportDate, ...sample, dropped: [] });
    expect(exportJson(sample, exportDate)).toContain('\n  "profile": {\n    "displayName": "Sample Student",');
  });

  it('uses fixed field order regardless of the input property order', () => {
    const reordered = {
      gameStats: [{ tries: 7, solved: false, day: '2026-10-31', game: 'pulse' }],
      reviewState: [{ interval: 3, nextDueDate: '2026-11-03', id: 'sample-card' }],
      progress: [{ date: '2026-10-31', result: true, id: 'sample-item' }],
      onboarding: { school: 'Sample School', done: true, examDate: '2026-12-01', course: 'fundamentals' },
      profile: { createdAt: '2026-10-01T12:00:00Z', displayName: 'Sample Student' },
    };
    expect(exportJson(reordered, exportDate)).toBe(exportJson(sample, exportDate));
    expect(Object.keys(json(sample))).toEqual(['format', 'exportDate', 'profile', 'onboarding', 'progress', 'reviewState', 'gameStats', 'dropped']);
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
      format: 'cueory-export-1', exportDate, profile: {}, onboarding: {}, progress: [], reviewState: [], gameStats: [], dropped: [],
    });
  });

  it('drops unknown fields at every depth and reports only sorted field paths', () => {
    const hidden = 'sample: discarded private value';
    const input = {
      ...sample, extra: { hidden },
      profile: { ...sample.profile, email: hidden },
      onboarding: { ...sample.onboarding, tracking: hidden },
      progress: [{ ...sample.progress![0], rationale: hidden }],
      reviewState: [{ ...sample.reviewState![0], otherStudent: hidden }],
      gameStats: [{ ...sample.gameStats![0], fingerprint: hidden }],
    };
    expect(json(input)).toEqual({ ...json(sample), dropped: [
      'extra', 'gameStats[0].fingerprint', 'onboarding.tracking', 'profile.email', 'progress[0].rationale', 'reviewState[0].otherStudent',
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
      'gameStats[0].game', 'onboarding.course', 'onboarding.done', 'onboarding.examDate', 'onboarding.school',
      'profile.createdAt', 'profile.displayName', 'progress[0].result', 'reviewState[0].interval',
    ]);
  });

  it('reports incomplete or malformed rows and sections without fabricating records', () => {
    expect(json({ progress: [{ id: 'sample-item' }, null], reviewState: {}, gameStats: 'sample: invalid' }).dropped)
      .toEqual(['gameStats', 'progress[0].date', 'progress[0].result', 'progress[1]', 'reviewState']);
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

  it.each(['2026-11-01', '2026-11-01T08:00:00Z', exportDate])('uses the supplied export date %s exactly', date => {
    expect(JSON.parse(exportJson({}, date)).exportDate).toBe(date);
  });
  it.each(['', '2026-02-30', 'sample: tomorrow', '0000-01-01'])('refuses an unusable export date %s without consulting a clock', date => {
    expect(() => exportJson({}, date)).toThrow('pass the export date as a real day or a UTC date and time.');
  });
});

describe('CSV export', () => {
  it('returns section files in fixed order with RFC 4180 record endings', () => {
    const files = exportCsv(sample);
    expect(files.map(entry => entry.fileName)).toEqual(['profile.csv', 'onboarding.csv', 'progress.csv', 'reviewState.csv', 'gameStats.csv', 'dropped.csv']);
    expect(files.every(entry => entry.text.endsWith('\r\n'))).toBe(true);
    expect(parseRows(file(sample, 'progress'))).toEqual([['id', 'result', 'date'], ['sample-item', 'true', '2026-10-31']]);
    expect(parseRows(file(sample, 'gameStats'))).toEqual([['game', 'day', 'solved', 'tries'], ['pulse', '2026-10-31', 'false', '7']]);
  });

  it('preserves sample commas, quotes, Unicode and embedded LF/CRLF after parsing', () => {
    const displayName = 'Sample: "Ána", 王\nnext line\r\nlast line';
    const school = 'Sample: "School", East';
    const input = { profile: { displayName }, onboarding: { school } };
    expect(file(input, 'profile')).toContain('"Sample: ""Ána"", 王\nnext line\r\nlast line"');
    expect(parseRows(file(input, 'profile'))[1]).toEqual([displayName, '']);
    expect(parseRows(file(input, 'onboarding'))[1]).toEqual(['', '', '', school]);
  });

  it.each(['=1+1', '+1+1', '-1+1', '@sample', '\tsample', '\rsample', '\n=1+1'])('quotes formula-like sample cells as text: %j', value => {
    const input = {
      profile: { displayName: value }, onboarding: { course: value, school: value },
      progress: [{ id: value, result: value, date: '2026-10-31' }],
      reviewState: [{ id: value, nextDueDate: '2026-11-01', interval: 0 }],
      [value]: 'sample: private discarded value',
    };
    expect(parseRows(file(input, 'profile'))[1][0]).toBe(`'${value}`);
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
    expect(files).toHaveLength(6);
    expect(files.every(entry => parseRows(entry.text).length === 1)).toBe(true);
    expect(files[5]).toEqual({ fileName: 'dropped.csv', text: 'dropped\r\n' });
  });

  it('returns fresh files and the same stable output for repeated exports', () => {
    const first = exportCsv(sample);
    const second = exportCsv(sample);
    expect(first).toEqual(second);
    first[0].text = 'sample: changed';
    expect(exportCsv(sample)).toEqual(second);
  });
});
