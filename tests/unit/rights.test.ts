import { describe, expect, it } from 'vitest';
import { rightsProblems, usableAssets, type RightsRecord } from '../../src/islands/rights';

const now = '2026-11-01T12:00:00.123456Z';
const sample: RightsRecord = {
  asset: '/sample-image.png', holder: 'sample: rights holder', license: 'sample: recorded license',
  evidence_url: 'https://example.invalid/sample-evidence', verified: true, verified_at: now,
};
const check = (overrides: Partial<RightsRecord>) => rightsProblems({ ...sample, ...overrides }, now);

describe('the rights-record text constraints', () => {
  it('accepts valid records without requiring verification', () => {
    expect(rightsProblems(sample, now)).toEqual([]);
    expect(check({ verified: false, verified_at: null })).toEqual([]);
  });

  it.each([['asset', 500], ['holder', 200], ['license', 100]] as const)('checks both %s length boundaries in Unicode code points', (field, max) => {
    expect(check({ [field]: '' })).toContain(`the ${field} must have 1 to ${max} characters.`);
    expect(check({ [field]: 'x' })).toEqual([]);
    expect(check({ [field]: '😀'.repeat(max) })).toEqual([]);
    expect(check({ [field]: '😀'.repeat(max + 1) })).toContain(`the ${field} must have 1 to ${max} characters.`);
  });

  it.each(['asset', 'holder', 'license'] as const)('rejects every C0/C1 control in %s', field => {
    for (const code of [...Array.from({ length: 32 }, (_, i) => i), ...Array.from({ length: 33 }, (_, i) => i + 127)]) {
      expect(check({ [field]: `sample${String.fromCodePoint(code)}` })).toContain(`the ${field} cannot contain control characters.`);
    }
  });

  it('does not trim fields or invent stricter path and license rules', () => {
    expect(check({ asset: ' ', holder: ' ', license: ' ' })).toEqual([]);
    expect(check({ asset: 'https://example.invalid/sample.png' })).toEqual([]);
  });

  it('checks the evidence prefix, remaining text and 500-code-point boundary', () => {
    expect(check({ evidence_url: 'https://' + '😀'.repeat(492) })).toEqual([]);
    for (const value of ['', 'https://', 'http://example.invalid', 'HTTPS://example.invalid', 'javascript:sample', 'https://' + 'x'.repeat(493)]) {
      expect(check({ evidence_url: value })).toContainEqual(expect.stringContaining('the evidence link'));
    }
    // This is the migration's prefix/text constraint, not an additional URL-host parser.
    expect(check({ evidence_url: 'https:///' })).toEqual([]);
  });

  it('rejects SQL whitespace and controls anywhere in an evidence link', () => {
    const codes = [...Array.from({ length: 33 }, (_, i) => i), ...Array.from({ length: 33 }, (_, i) => i + 127),
      0x1680, ...Array.from({ length: 7 }, (_, i) => i + 0x2000), 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x205f, 0x3000];
    for (const code of codes) expect(check({ evidence_url: `https://example.invalid/${String.fromCodePoint(code)}` })).toContainEqual(expect.stringContaining('the evidence link'));
  });

  it('keeps PostgreSQL UTF-8 nonbreaking spaces and BOM distinct from its whitespace class', () => {
    for (const character of ['\u00a0', '\u2007', '\u202f', '\ufeff']) {
      expect(check({ evidence_url: `https://example.invalid/${character}` })).toEqual([]);
    }
  });

  it('reports separate failed constraints together, without echoing field values', () => {
    const problems = check({ asset: '\n'.repeat(501), holder: '', license: '\u007f', evidence_url: 'sample: private evidence' });
    expect(problems).toHaveLength(5);
    expect(problems.join(' ')).not.toContain('sample: private evidence');
  });

  it('refuses missing, wrong-type and inherited fields without invoking getters', () => {
    expect(rightsProblems(null, now)).not.toEqual([]);
    expect(rightsProblems([], now)).not.toEqual([]);
    expect(rightsProblems({ ...sample, verified: 'true' }, now)).toContain('verified must be true or false.');
    expect(rightsProblems({ ...sample, holder: 1 }, now)).toContain('the holder must be text.');
    expect(rightsProblems(Object.create(sample), now)).not.toEqual([]);
    expect(rightsProblems({ ...sample, get asset() { throw new Error('must not run'); } }, now)).toContain('the asset must be text.');
  });
});

describe('verification and time constraints', () => {
  it('requires a date exactly when verified is true', () => {
    expect(check({ verified_at: null })).toContainEqual(expect.stringContaining('a verified record needs'));
    expect(check({ verified: false })).toContainEqual(expect.stringContaining('a verified record needs'));
  });

  it('rejects a future microsecond, including within the SQL clock-skew allowance', () => {
    expect(check({ verified_at: '2026-11-01T12:00:00.123455Z' })).toEqual([]);
    expect(check({ verified_at: '2026-11-01T12:00:00.123457Z' })).toContain('the verification date cannot be in the future.');
    expect(check({ verified_at: '2026-11-01T12:00:30Z' })).toContain('the verification date cannot be in the future.');
  });

  it('compares offsets as instants and preserves sub-millisecond ordering', () => {
    expect(check({ verified_at: '2026-11-01T05:00:00.123456-07:00' })).toEqual([]);
    expect(check({ verified_at: '2026-11-01T05:00:00.123457-07:00' })).toContain('the verification date cannot be in the future.');
    expect(check({ verified_at: '2026-11-01T13:00:00.123456+01:00' })).toEqual([]);
    expect(rightsProblems({ ...sample, verified_at: '1969-12-31T23:59:59.999999Z' }, '1970-01-01T00:00:00Z')).toEqual([]);
  });

  it.each(['not a date', '', '2026-02-30T00:00:00Z', '2026-13-01T00:00:00Z', '2026-11-01T24:00:00Z',
    '2026-11-01T12:60:00Z', '2026-11-01T12:00:60Z', '2026-11-01T12:00:00', '2026-11-01', 'infinity', '2026-11-01T12:00:00+01:99'])(
    'refuses the invalid verification timestamp %j', value => expect(check({ verified_at: value })).toContain('the verification date must be a valid timestamp.'),
  );

  it('accepts a Date for now and refuses an invalid or omitted clock', () => {
    expect(rightsProblems({ ...sample, verified_at: '2026-11-01T12:00:00.123Z' }, new Date('2026-11-01T12:00:00.123Z'))).toEqual([]);
    for (const clock of [new Date('invalid'), 'invalid', '2026-02-30T00:00:00Z', undefined] as (string | Date)[]) {
      expect(rightsProblems(sample, clock)).toContain('the current time must be a valid timestamp.');
      expect(usableAssets([sample.asset], [sample], clock)).toEqual([]);
    }
  });
});

describe('usable assets', () => {
  it('requires an exact verified, problem-free record', () => {
    const records: RightsRecord[] = [sample, { ...sample, asset: '/sample-draft.png', verified: false, verified_at: null },
      { ...sample, asset: '/sample-invalid.png', holder: '' }, { ...sample, asset: '/sample-future.png', verified_at: '2026-11-02T00:00:00Z' }];
    expect(usableAssets(['/sample-missing.png', '/sample-image.PNG', '/sample-draft.png', '/sample-invalid.png', '/sample-future.png', sample.asset], records, now)).toEqual([sample.asset]);
  });

  it('does not normalize case, URLs, escapes, whitespace or path segments', () => {
    expect(usableAssets(['/SAMPLE-image.png', ' /sample-image.png', '/sample-image.png ', '/sample%2Dimage.png', '/a/../sample-image.png', 'https://example.invalid/sample-image.png'], [sample], now)).toEqual([]);
  });

  it('deduplicates both inputs and preserves the assets first-seen order', () => {
    const other = { ...sample, asset: '/sample-other.png' };
    const assets = [other.asset, sample.asset, other.asset, sample.asset];
    const records = [sample, sample, other, { ...sample, verified: false, verified_at: null }];
    expect(usableAssets(assets, records, now)).toEqual([other.asset, sample.asset]);
    expect(usableAssets(assets, records.toReversed(), now)).toEqual([other.asset, sample.asset]);
  });

  it('handles Object prototype names as exact assets', () => {
    const assets = ['constructor', '__proto__'];
    expect(usableAssets(assets, assets.map(asset => ({ ...sample, asset })), now)).toEqual(assets);
  });

  it('never mutates records, assets or the supplied Date', () => {
    const assets = Object.freeze([sample.asset]);
    const records = Object.freeze([Object.freeze({ ...sample })]);
    const clock = new Date('2026-11-01T12:00:01Z');
    const before = clock.toISOString();
    expect(usableAssets(assets, records, clock)).toEqual([sample.asset]);
    expect(clock.toISOString()).toBe(before);
  });
});
