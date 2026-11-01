import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS, ALL_FOUR_GAMES_BONUS, DAILY_STUDY_POINT_LIMIT, EVENT_MAX_AGE_DAYS,
  GAME_POINTS, PERFECT_GAME_BONUS, STUDY_SESSION_POINTS, WEEKLY_FREE_PASSES,
  applyResult, emptyRewards, weekKey, type RewardsState, type RewardEvent,
} from '../../src/islands/rewards';

const day = (offset: number, origin = '2026-11-01'): string =>
  new Date(Date.parse(origin + 'T00:00:00Z') + offset * 86_400_000).toISOString().slice(0, 10);
const game = (dayValue = '2026-11-01', id: 'pulse' | 'cueword' | 'triage' | 'suture' = 'pulse',
  solved = true, slips = 1, cues = 0): RewardEvent =>
  ({ type: 'game', finished: true, game: id, day: dayValue, solved, slips, cues });
const study = (id: string, date = '2026-11-01', mode: 'cards' | 'learn' | 'review' = 'cards'): RewardEvent =>
  ({ type: 'study', finished: true, id, day: date, mode });
const earn = (state: RewardsState, event: RewardEvent, today = event.day) => applyResult(state, event, today).state;
const has = (state: RewardsState, id: string) => state.achievements.some((item) => item.id === id);

describe('rewards: fixed rules and input validation', () => {
  it('has named constants and starts with no points, no streak, and one weekly pass', () => {
    expect([GAME_POINTS, PERFECT_GAME_BONUS, ALL_FOUR_GAMES_BONUS, STUDY_SESSION_POINTS,
      DAILY_STUDY_POINT_LIMIT, WEEKLY_FREE_PASSES, EVENT_MAX_AGE_DAYS]).toEqual([10, 5, 10, 5, 50, 1, 1]);
    expect(emptyRewards()).toEqual({
      version: 1, points: 0, games: [], studies: [], achievements: [],
      currentStreak: 0, bestStreak: 0, passesLeftThisWeek: 1, lastEvaluatedDay: null,
    });
    expect(ACHIEVEMENTS.map((a) => a.id)).toHaveLength(12);
    expect(ACHIEVEMENTS.every((a) => a.name === a.name.toLowerCase())).toBe(true);
  });

  it('awards ten points for a completed game and a five-point bonus only if solved with no slips or cues', () => {
    const first = applyResult(emptyRewards(), game('2026-11-01', 'pulse', false, 0, 0), '2026-11-01');
    expect(first.accepted).toBe(true);
    expect(first.pointsEarned).toBe(10);
    expect(first.state.points).toBe(10);
    expect(first.achievementsEarned.map((a) => a.id)).toEqual(['first-game']);
    expect(has(first.state, 'first-game')).toBe(true);

    const flawless = applyResult(first.state, game('2026-11-01', 'triage', true, 0, 0), '2026-11-01');
    expect(flawless.pointsEarned).toBe(15);
    const hinted = applyResult(flawless.state, game('2026-11-01', 'suture', true, 0, 1), '2026-11-01');
    expect(hinted.pointsEarned).toBe(10);
    expect(hinted.state.points).toBe(35);
  });

  it('awards the four-game daily bonus once, independent of finish order or repeat requests', () => {
    let state = emptyRewards();
    let lastPoints = 0;
    for (const id of ['cueword', 'pulse', 'suture', 'triage'] as const) {
      const result = applyResult(state, game('2026-11-01', id), '2026-11-01');
      state = result.state;
      lastPoints = result.pointsEarned;
    }
    expect(lastPoints).toBe(GAME_POINTS + ALL_FOUR_GAMES_BONUS);
    expect(state.points).toBe(50);
    expect(has(state, 'all-four')).toBe(true);
    const replay = applyResult(state, game('2026-11-01', 'triage', true, 0, 0), '2026-11-01');
    expect(replay.accepted).toBe(false);
    expect(replay.state).toBe(state);
    expect(replay.pointsEarned).toBe(0);
    expect(replay.achievementsEarned).toEqual([]);
    expect(state.games).toHaveLength(4);
  });

  it('counts each study session once and caps the daily study award at fifty points', () => {
    let state = emptyRewards();
    for (let i = 1; i <= 10; i++) state = earn(state, study('round-' + i));
    expect(state.points).toBe(50);
    expect(has(state, 'first-study')).toBe(true);
    const extra = applyResult(state, study('round-11'), '2026-11-01');
    expect(extra.accepted).toBe(true);
    expect(extra.pointsEarned).toBe(0);
    expect(extra.state.studies).toHaveLength(11);
    const duplicate = applyResult(extra.state, study('round-11', '2026-11-02'), '2026-11-02');
    expect(duplicate.accepted).toBe(false);
    expect(duplicate.state).toBe(extra.state);
    const next = applyResult(extra.state, study('round-12', '2026-11-02', 'review'), '2026-11-02');
    expect(next.pointsEarned).toBe(5);
    expect(next.state.points).toBe(55);
  });

  it('ignores malformed, incomplete, stale and future events without changing the state', () => {
    const state = earn(emptyRewards(), game());
    const invalid: unknown[] = [
      null, [], {}, 'game', { ...game(), finished: false }, { ...game(), game: 'unknown' },
      { ...game(), day: '2026-02-30' }, { ...game(), day: '2026-11-1' },
      { ...game(), slips: -1 }, { ...game(), slips: 0.5 }, { ...game(), cues: NaN },
      { ...game(), unexpected: 'extra' }, { ...study('ok'), id: '../not-safe' },
      { ...study('ok'), mode: 'timer' }, { ...study('ok'), finished: false },
      { ...study('ok'), secret: 'do not include unexpected fields' },
      game('2026-10-30', 'triage'), game('2026-11-03', 'triage'),
    ];
    for (const event of invalid) {
      const result = applyResult(state, event, '2026-11-01');
      expect(result.state).toBe(state);
      expect(result.accepted).toBe(false);
      expect(result.pointsEarned).toBe(0);
    }
    // Yesterday is the oldest permitted event, including on a different month.
    const late = applyResult(emptyRewards(), game('2026-10-31'), '2026-11-01');
    expect(late.accepted).toBe(true);
    expect(late.achievementsEarned[0]?.earnedDate).toBe('2026-10-31');
    expect(() => applyResult(state, game(), '2026-02-30')).toThrow(/calendar day/);
  });

  it('is immutable, round-trips through JSON and detects fabricated scores and duplicate history', () => {
    const first = earn(emptyRewards(), game());
    const frozen = Object.freeze({
      ...first, games: Object.freeze(first.games.map((v) => Object.freeze(v))),
      studies: Object.freeze(first.studies), achievements: Object.freeze(first.achievements.map((v) => Object.freeze(v))),
    });
    const updated = applyResult(frozen, study('new-round'), '2026-11-01');
    expect(updated.state.games[0]).toEqual(first.games[0]);
    expect(updated.state.games[0]).not.toBe(first.games[0]);
    expect(frozen.points).toBe(10);
    const saved = JSON.parse(JSON.stringify(updated.state));
    expect(applyResult(saved, study('newer-round', '2026-11-02'), '2026-11-02').pointsEarned).toBe(5);
    expect(() => applyResult({ ...first, points: 999 }, study('round'), '2026-11-01')).toThrow(/invalid rewards state/);
    expect(() => applyResult({ ...first, version: 9 }, study('round'), '2026-11-01')).toThrow();
    expect(() => applyResult({ ...first, games: [...first.games, first.games[0]] }, study('round'), '2026-11-01')).toThrow();
    expect(() => applyResult({ ...first, achievements: [{ id: 'made-up', name: 'fake', rule: '', earnedDate: '2026-11-01' }] }, study('round'), '2026-11-01')).toThrow();
  });

  it('never looks up the current clock or any browser service', () => {
    // Explicitly passing the date produces repeatable state regardless of runtime time zones.
    const a = applyResult(emptyRewards(), game('2026-11-01'), '2026-11-01');
    const b = applyResult(emptyRewards(), game('2026-11-01'), '2026-11-01');
    expect(a).toEqual(b);
  });
});

describe('game streaks and weekly free passes', () => {
  it('uses Monday–Sunday weeks across month, new year and leap day', () => {
    expect(weekKey('2026-11-01')).toBe('2026-10-26');
    expect(weekKey('2026-11-02')).toBe('2026-11-02');
    expect(weekKey('2027-01-01')).toBe('2026-12-28');
    expect(weekKey('2027-01-03')).toBe('2026-12-28');
    expect(weekKey('2027-01-04')).toBe('2027-01-04');
    expect(weekKey('2028-02-29')).toBe('2028-02-28');
    expect(() => weekKey('2026-02-29')).toThrow(/real calendar day/);
    expect(() => weekKey('2026-13-01')).toThrow();
  });

  it('counts a missed day only when that week has an unused free pass', () => {
    let state = earn(emptyRewards(), game('2026-11-02'));
    const covered = applyResult(state, game('2026-11-04'), '2026-11-04');
    state = covered.state;
    expect(state.currentStreak).toBe(3); // Monday game, Tuesday pass, Wednesday game.
    expect(state.bestStreak).toBe(3);
    expect(state.passesLeftThisWeek).toBe(0);
    expect(has(state, 'game-streak-3')).toBe(true);

    const broken = applyResult(state, game('2026-11-06'), '2026-11-06');
    expect(broken.state.currentStreak).toBe(1);
    expect(broken.state.bestStreak).toBe(3);
    expect(broken.streakMessage).toBe('new streak: day 1. best streak: 3 days.');
    expect(broken.streakMessage).not.toMatch(/lost|failed|guilt|loser/i);
    expect(broken.state.passesLeftThisWeek).toBe(0);
  });

  it('gets a fresh pass in the next week without restoring last week’s used pass', () => {
    let state = earn(emptyRewards(), game('2026-12-31'));
    state = earn(state, game('2027-01-02')); // Jan 1 covered in the prior Monday week.
    expect(state.currentStreak).toBe(3);
    expect(state.passesLeftThisWeek).toBe(0);
    state = earn(state, game('2027-01-03'));
    state = earn(state, game('2027-01-04')); // New Monday week.
    expect(state.currentStreak).toBe(5);
    expect(state.passesLeftThisWeek).toBe(1);
    state = earn(state, game('2027-01-06')); // Jan 5 pass in new week.
    expect(state.currentStreak).toBe(7);
    expect(state.passesLeftThisWeek).toBe(0);
    expect(has(state, 'game-streak-7')).toBe(true);
  });

  it('can cover consecutive missing days if they are in different Monday–Sunday weeks', () => {
    let state = earn(emptyRewards(), game('2026-11-07')); // Saturday
    state = earn(state, game('2026-11-10')); // Sunday and Monday both missed, different weeks.
    expect(state.currentStreak).toBe(4);
    expect(state.bestStreak).toBe(4);
    expect(state.passesLeftThisWeek).toBe(0);
    state = earn(state, game('2026-11-14')); // Three missing days, impossible to cover.
    expect(state.currentStreak).toBe(1);
  });

  it('awards the 3-, 7-, 30-, 100-day milestones once and keeps the best streak', () => {
    let state = emptyRewards();
    const achieved = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const date = day(i, '2026-01-01');
      const next = applyResult(state, game(date), date);
      next.achievementsEarned.forEach((a) => {
        expect(achieved.has(a.id)).toBe(false);
        achieved.add(a.id);
      });
      state = next.state;
    }
    expect(state.currentStreak).toBe(100);
    expect(state.bestStreak).toBe(100);
    for (const id of ['game-streak-3','game-streak-7','game-streak-30','game-streak-100']) {
      expect(achieved.has(id)).toBe(true);
    }
    const later = earn(state, game(day(104,'2026-01-01')), day(104,'2026-01-01'));
    expect(later.bestStreak).toBe(100);
    expect(later.currentStreak).toBe(1);
  });

  it('counts seven distinct study days in a row and ignores gaps', () => {
    let state = emptyRewards();
    for (let i = 0; i < 7; i++) {
      const date = day(i,'2026-05-01');
      state = earn(state, study('session-' + i, date), date);
      expect(has(state, 'study-streak-7')).toBe(i >= 6);
    }
    state = earn(state, study('later-session', '2026-05-12'), '2026-05-12');
    expect(state.achievements.filter((a) => a.id === 'study-streak-7')).toHaveLength(1);
  });
});

describe('milestones and monotone points', () => {
  it('awards ten perfect games once, and 100 / 1000 / 5000 points once', () => {
    let state = emptyRewards();
    const earned = new Set<string>();
    let lastTotal = 0;
    for (let i = 0; i < 74; i++) {
      const date = day(i, '2026-01-01');
      for (const id of ['pulse','cueword','triage','suture'] as const) {
        const result = applyResult(state, game(date,id,true,0,0), date);
        expect(result.pointsEarned).toBeGreaterThanOrEqual(0);
        expect(result.state.points).toBeGreaterThanOrEqual(lastTotal);
        lastTotal = result.state.points;
        for (const a of result.achievementsEarned) {
          expect(earned.has(a.id)).toBe(false);
          earned.add(a.id);
        }
        state = result.state;
      }
    }
    expect(state.points).toBe(74 * (4 * 15 + 10));
    for (const id of ['perfect-10','points-100','points-1000','points-5000','all-four','first-game']) {
      expect(earned.has(id)).toBe(true);
      expect(state.achievements.filter((a) => a.id === id)).toHaveLength(1);
    }
    expect(state.achievements.every((a) => a.earnedDate <= state.lastEvaluatedDay!)).toBe(true);
  });
});
