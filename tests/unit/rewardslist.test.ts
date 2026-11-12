import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import RewardsList from '../../src/islands/RewardsList';
import { buildRewardsPreview, type LabeledSampleEvent } from '../../src/islands/rewardslist';

const TODAY = '2026-11-11';
const game = (
  day: string, id: 'pulse' | 'cueword' | 'triage' | 'suture' = 'pulse',
  solved = true, slips = 1, cues = 0,
): LabeledSampleEvent => ({
  label: '[sample finished game]',
  event: { type: 'game', finished: true, game: id, day, solved, slips, cues },
});
const study = (day: string, id: string): LabeledSampleEvent => ({
  label: '[sample finished study session]',
  event: { type: 'study', finished: true, id, day, mode: 'cards' },
});
const row = (preview: ReturnType<typeof buildRewardsPreview>, id: string) =>
  preview.summary.find((entry) => entry.id === id)?.text;

describe('rewards preview: local model output in words', () => {
  it('shows the empty state without inventing achievements or user history', () => {
    const preview = buildRewardsPreview([], TODAY);
    expect(preview.today).toBe(TODAY);
    expect(row(preview, 'points')).toBe('0 points earned.');
    expect(row(preview, 'games')).toBe('0 games finished.');
    expect(row(preview, 'studies')).toBe('0 sessions finished.');
    expect(row(preview, 'current-streak')).toBe('0 days in the current streak.');
    expect(row(preview, 'passes')).toBe('1 free pass left.');
    expect(preview.events).toEqual([]);
    expect(preview.achievements).toEqual([]);
    const html = renderToStaticMarkup(createElement(RewardsList, { preview }));
    expect(html).toContain('no sample events yet.');
    expect(html).toContain('none earned in these samples.');
    expect(html).toContain('data-testid="rewards-summary"');
  });

  it('shows one finished game, points and its achievement in readable text', () => {
    const preview = buildRewardsPreview([game(TODAY, 'pulse', true, 0, 0)], TODAY);
    expect(row(preview, 'points')).toBe('15 points earned.');
    expect(row(preview, 'games')).toBe('1 game finished.');
    expect(row(preview, 'current-streak')).toBe('1 day in the current streak.');
    expect(preview.events[0]?.text).toBe('15 points earned for this finished game on 2026-11-11.');
    expect(preview.achievements.map((a) => a.name)).toEqual(['first game']);
    const html = renderToStaticMarkup(createElement(RewardsList, { preview }));
    expect(html).toContain('[sample finished game]');
    expect(html).toContain('first game, earned on 2026-11-11.');
    expect(html).not.toContain('<script');
  });

  it('uses the model for several games, its all-four bonus and study sessions', () => {
    const events = [
      game(TODAY, 'pulse'), game(TODAY, 'cueword'),
      game(TODAY, 'triage'), game(TODAY, 'suture'),
      study(TODAY, 'sample-study-1'),
    ];
    const preview = buildRewardsPreview(events, TODAY);
    expect(row(preview, 'games')).toBe('4 games finished.');
    expect(row(preview, 'studies')).toBe('1 session finished.');
    expect(row(preview, 'points')).toBe('55 points earned.');
    expect(preview.events).toHaveLength(5);
    expect(preview.events[3]?.text).toContain('20 points earned');
    expect(preview.achievements.map((a) => a.id)).toEqual(['first-game', 'all-four', 'first-study']);
    expect(events).toHaveLength(5); // The input is not mutated.
  });

  it('sorts out-of-order samples and shows the streak across three calendar days', () => {
    const before = [game(TODAY), game('2026-11-09'), study(TODAY, 'sample-study-2'), game('2026-11-10')];
    const preview = buildRewardsPreview(before, TODAY);
    expect(row(preview, 'current-streak')).toBe('3 days in the current streak.');
    expect(row(preview, 'best-streak')).toBe('3 days in the best streak.');
    expect(preview.events.map((r) => r.text.match(/on (\d{4}-\d{2}-\d{2})/)?.[1])).toEqual([
      '2026-11-09', '2026-11-10', TODAY, TODAY,
    ]);
    expect(preview.achievements.map((a) => a.id)).toContain('game-streak-3');
    expect(before[0]?.event.day).toBe(TODAY);
  });

  it('fails closed for unlabeled, duplicate, future and invalid calendar sample events', () => {
    expect(() => buildRewardsPreview([{ ...game(TODAY), label: 'finished game' }], TODAY)).toThrow(/bracketed sample/);
    expect(() => buildRewardsPreview([game(TODAY), game(TODAY)], TODAY)).toThrow(/rejected/);
    expect(() => buildRewardsPreview([game('2026-11-12')], TODAY)).toThrow(/future/);
    expect(() => buildRewardsPreview([], '2026-02-30')).toThrow(/calendar day/);
    expect(() => buildRewardsPreview([game('2026-11-00')], TODAY)).toThrow(/calendar day|rejected/);
  });
});

describe('W02-2 edge cases and safe sample rendering', () => {
  it('caps study points at fifty each day while counting accepted extra sessions', () => {
    const sessions = Array.from({ length: 11 }, (_, index) => study(TODAY, `sample-study-${index + 1}`));
    const preview = buildRewardsPreview(sessions, TODAY);
    expect(row(preview, 'points')).toBe('50 points earned.');
    expect(row(preview, 'studies')).toBe('11 sessions finished.');
    expect(preview.events).toHaveLength(11);
    expect(preview.events[10]?.text).toBe('0 points earned for this finished study session on 2026-11-11.');
    expect(preview.achievements.map((item) => item.id)).toEqual(['first-study']);
  });

  it('preserves the original event order within a day and never mutates inputs', () => {
    const events = [
      { ...game(TODAY, 'pulse'), label: '[sample first]' },
      { ...study(TODAY, 'sample-study-1'), label: '[sample second]' },
      { ...game(TODAY, 'cueword'), label: '[sample third]' },
    ];
    const original = structuredClone(events);
    const preview = buildRewardsPreview(events, TODAY);
    expect(preview.events.map((event) => event.label)).toEqual([
      '[sample first]', '[sample second]', '[sample third]',
    ]);
    expect(events).toEqual(original);
  });

  it('escapes bracketed sample labels when rendered as HTML text', () => {
    const preview = buildRewardsPreview([{ ...game(TODAY), label: '[sample <strong>label</strong>]' }], TODAY);
    const html = renderToStaticMarkup(createElement(RewardsList, { preview }));
    expect(html).toContain('[sample &lt;strong&gt;label&lt;/strong&gt;]');
    expect(html).not.toContain('<strong>label</strong>');
    expect(html).not.toContain('<script');
  });

  it('rejects duplicate study ids and impossible sample dates without generating rewards', () => {
    expect(() => buildRewardsPreview([
      study(TODAY, 'sample-study-1'), study(TODAY, 'sample-study-1'),
    ], TODAY)).toThrow(/rejected/);
    expect(() => buildRewardsPreview([game('2026-02-30')], TODAY)).toThrow(/rejected/);
    expect(() => buildRewardsPreview([game('1899-12-31')], TODAY)).toThrow(/rejected/);
  });
});
