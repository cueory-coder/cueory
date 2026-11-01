import { describe, expect, it } from 'vitest';
import { dueOn, nextReview, whenInWords, type Review } from '../../src/islands/review';

const missed = (day: string): Review => ({ day, result: 'missed' });
const knew = (day: string): Review => ({ day, result: 'knew' });

describe('review intervals', () => {
  it('keeps new cards unscheduled', () => {
    expect(nextReview([])).toBeUndefined();
    expect(nextReview([], '2026-11-20', '2026-11-01')).toBeUndefined();
    expect(dueOn([{ id: 'new', history: [] }], '2026-11-01')).toEqual([]);
  });

  it.each([
    [[missed('2026-11-01')], '2026-11-02'],
    [[knew('2026-11-01')], '2026-11-04'],
    [[knew('2026-10-30'), knew('2026-11-01')], '2026-11-08'],
    [[knew('2026-10-29'), knew('2026-10-30'), knew('2026-11-01')], '2026-11-15'],
    [[knew('2026-10-28'), knew('2026-10-29'), knew('2026-10-30'), knew('2026-11-01')], '2026-11-15'],
  ] satisfies [Review[], string][])('uses the trailing streak for %j', (history, expected) => {
    expect(nextReview(history)).toBe(expected);
  });

  it('resets a long streak after a miss and starts climbing again', () => {
    const history = [knew('2026-10-01'), knew('2026-10-04'), knew('2026-10-11'), missed('2026-10-25')];
    expect(nextReview(history)).toBe('2026-10-26');
    expect(nextReview([...history, knew('2026-10-26')])).toBe('2026-10-29');
  });

  it.each([
    ['2026-01-31', '2026-02-01'], ['2026-12-31', '2027-01-01'],
    ['2028-02-28', '2028-02-29'], ['2026-02-28', '2026-03-01'],
    ['0099-12-31', '0100-01-01'],
  ])('crosses calendar boundaries from %s', (day, expected) => {
    expect(nextReview([missed(day)])).toBe(expected);
  });

  it('allows same-day reviews and does not mutate inputs', () => {
    const history = Object.freeze([Object.freeze(knew('2026-11-01')), Object.freeze(knew('2026-11-01'))]);
    expect(nextReview(history)).toBe('2026-11-08');
  });
});

describe('exam limits', () => {
  const history = [knew('2026-10-20'), knew('2026-10-21'), knew('2026-11-01')];
  it('shortens to the day before the exam', () => {
    expect(nextReview(history, '2026-11-10')).toBe('2026-11-09');
  });
  it('keeps an earlier review and ignores a past exam', () => {
    expect(nextReview(history, '2026-11-30')).toBe('2026-11-15');
    expect(nextReview(history, '2026-10-31')).toBe('2026-11-15');
    expect(nextReview(history, '2026-11-03', '2026-11-04')).toBe('2026-11-15');
  });
  it('uses tomorrow when the day before an active exam is already past or today', () => {
    expect(nextReview(history, '2026-11-01')).toBe('2026-11-02');
    expect(nextReview(history, '2026-11-02')).toBe('2026-11-02');
    expect(nextReview(history, '2026-11-04', '2026-11-04')).toBe('2026-11-05');
  });
  it('retains overdue dates when no active exam shortens them', () => {
    expect(nextReview([missed('2026-11-01')], undefined, '2026-11-06')).toBe('2026-11-02');
    expect(nextReview([missed('2026-11-01')], '2026-11-10', '2026-11-06')).toBe('2026-11-02');
  });
  it('uses dueOn today to ignore an exam that passed after the last review', () => {
    expect(dueOn([{ id: 'colors', history }], '2026-11-04', '2026-11-03')).toEqual([]);
    expect(dueOn([{ id: 'colors', history }], '2026-11-15', '2026-11-03')).toEqual(['colors']);
  });
  it('keeps a capped review due on its scheduled day and on the exam day', () => {
    const cards = [{ id: 'colors', history }];
    expect(nextReview(history, '2026-11-10')).toBe('2026-11-09');
    expect(dueOn(cards, '2026-11-08', '2026-11-10')).toEqual([]);
    expect(dueOn(cards, '2026-11-09', '2026-11-10')).toEqual(['colors']);
    expect(dueOn(cards, '2026-11-10', '2026-11-10')).toEqual(['colors']);
    // The stated past-exam rule still applies once the exam is over.
    expect(dueOn(cards, '2026-11-11', '2026-11-10')).toEqual([]);
  });
  it('applies the minimum interval once, from the last review, when the exam is imminent', () => {
    const cards = [{ id: 'colors', history: [knew('2026-11-09')] }];
    expect(dueOn(cards, '2026-11-09', '2026-11-10')).toEqual([]);
    expect(dueOn(cards, '2026-11-10', '2026-11-10')).toEqual(['colors']);
  });
});

describe('due cards and words', () => {
  it('sorts by overdue day, breaks ties by id and leaves inputs alone', () => {
    const cards = Object.freeze([
      { id: 'z', history: [missed('2026-11-02')] },
      { id: 'a', history: [missed('2026-11-02')] },
      { id: 'old', history: [missed('2026-10-28')] },
      { id: 'future', history: [knew('2026-11-03')] },
      { id: 'new', history: [] },
    ]);
    expect(dueOn(cards, '2026-11-03')).toEqual(['old', 'a', 'z']);
    expect(cards.map((card) => card.id)).toEqual(['z', 'a', 'old', 'future', 'new']);
  });
  it.each([
    ['2026-11-01', 'today'], ['2026-11-02', 'tomorrow'], ['2026-11-04', 'in 3 days'],
    ['2026-10-31', '1 day ago'], ['2026-10-29', '3 days ago'],
  ])('describes %s', (due, words) => expect(whenInWords(due, '2026-11-01')).toBe(words));

  it('uses UTC day numbers over New York daylight-saving changes', () => {
    const before = process.env.TZ;
    try {
      for (const zone of ['America/New_York', 'America/Phoenix', 'UTC', 'Pacific/Auckland']) {
        process.env.TZ = zone;
        expect(nextReview([missed('2026-10-31')])).toBe('2026-11-01');
        expect(nextReview([knew('2026-10-31')])).toBe('2026-11-03');
        expect(whenInWords('2026-11-02', '2026-10-31')).toBe('in 2 days');
        expect(nextReview([missed('2026-03-08')])).toBe('2026-03-09');
      }
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
  });
});

describe('input errors', () => {
  it.each(['2026-02-30', '2026-02-29', '2026-13-01', '2026-1-01', '0000-01-01', '', '2026-11-01T01:00:00Z'])('rejects invalid day %j', (day) => {
    expect(() => nextReview([missed(day)])).toThrow('real calendar day');
    expect(() => whenInWords(day, '2026-11-01')).toThrow('real calendar day');
  });
  it('validates all dates even with empty inputs', () => {
    expect(() => nextReview([], 'bad')).toThrow();
    expect(() => dueOn([], 'bad')).toThrow();
    expect(() => dueOn([], '2026-11-01', 'bad')).toThrow();
  });
  it('rejects reversed, future and malformed history rather than inventing progress', () => {
    expect(() => nextReview([knew('2026-11-02'), missed('2026-11-01')])).toThrow('oldest first');
    expect(() => nextReview([knew('2026-11-02')], undefined, '2026-11-01')).toThrow('before the last review');
    expect(() => dueOn([{ id: 'colors', history: [knew('2026-11-02')] }], '2026-11-01')).toThrow('before the last review');
    expect(() => nextReview([{ day: '2026-11-01', result: 'other' } as unknown as Review])).toThrow('knew or missed');
    expect(() => nextReview(new Array<Review>(1))).toThrow();
  });
  it('rejects duplicate or empty card ids and calendar overflow', () => {
    expect(() => dueOn([{ id: 'a', history: [] }, { id: 'a', history: [] }], '2026-11-01')).toThrow('different');
    expect(() => dueOn([{ id: ' ', history: [] }], '2026-11-01')).toThrow('nonempty');
    expect(() => nextReview([missed('9999-12-31')])).toThrow('supported calendar');
  });
});
