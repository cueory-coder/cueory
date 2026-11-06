import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import data from '../../content/games/hello-cards/starters.json';
import { HELLO_CATEGORIES, HELLO_DEPTHS, dayIndex, isHelloCategory, isReflective, nextStarter, helloCardsShown, msUntilNextDay, promptOfTheDay, startersFor, type HelloStarter } from '../../src/islands/hellocards';

const starters = data.starters as HelloStarter[];
const seeded = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

describe('hello cards content', () => {
  it('is labeled a sample and has fifteen unique starters for each of the four categories', () => {
    expect(data.status).toBe('sample');
    expect(starters).toHaveLength(60);
    expect(new Set(starters.map((s) => s.id)).size).toBe(60);
    expect(new Set(starters.map((s) => s.text)).size).toBe(60);
    for (const category of HELLO_CATEGORIES) expect(startersFor(starters, category)).toHaveLength(15);
  });

  it('keeps starters short, friendly questions with no links', () => {
    for (const starter of starters) {
      expect(starter.text.endsWith('?'), starter.id).toBe(true);
      expect(starter.text.length, starter.id).toBeLessThanOrEqual(140);
      expect(starter.text, starter.id).not.toMatch(/https?:|www\.|@|<|>/);
    }
  });

  it('avoids topics the nurse should not pry into', () => {
    const avoid = /\b(diagnos|medic|pain|symptom|insurance|money|pay|church|pray|religio|politic|vote|party|illness|disease|surgery)/i;
    for (const starter of starters) expect(starter.text, starter.id).not.toMatch(avoid);
  });
});

describe('startersFor', () => {
  it('returns only the chosen category', () => {
    for (const category of HELLO_CATEGORIES) {
      expect(startersFor(starters, category).every((s) => s.category === category)).toBe(true);
    }
    expect(startersFor([], 'patients')).toEqual([]);
  });

  it('knows which values are categories', () => {
    expect(isHelloCategory('patients')).toBe(true);
    expect(isHelloCategory('nurses')).toBe(false);
    expect(isHelloCategory(3)).toBe(false);
  });
});

describe('nextStarter', () => {
  it('draws from the chosen category only', () => {
    for (const category of HELLO_CATEGORIES) {
      const { starter } = nextStarter(starters, category, 'small', [], null, seeded([0.1, 0.9]));
      expect(starter?.category).toBe(category);
    }
  });

  it('never repeats the card just shown, even with the worst draw', () => {
    const pool = [...startersFor(starters, 'coworkers', 'small'), ...startersFor(starters, 'coworkers', 'deep')];
    for (const last of pool) {
      for (const value of [0, 0.5, 0.999999]) {
        expect(nextStarter(starters, 'coworkers', last.depth, [], last.id, () => value).starter?.id).not.toBe(last.id);
      }
    }
  });

  it('shows every card once before any card comes round again', () => {
    let seen: string[] = [];
    let last: string | null = null;
    const shown: string[] = [];
    let n = 0;
    for (let i = 0; i < 7; i++) {
      const result = nextStarter(starters, 'classmates', 'deep', seen, last, () => ((n += 7) % 13) / 13);
      shown.push(result.starter!.id);
      seen = result.seen;
      last = result.starter!.id;
    }
    expect(new Set(shown).size).toBe(7);
    expect(shown.every((id) => starters.find((x) => x.id === id)!.depth === 'deep')).toBe(true);
    // The sixteenth card starts a new pass and is still not the one on screen.
    const again = nextStarter(starters, 'classmates', 'deep', seen, last, () => 0);
    expect(again.starter?.id).not.toBe(last);
    expect(again.seen).toEqual([again.starter!.id]);
  });

  it('ignores seen ids from another category', () => {
    const other = startersFor(starters, 'patients')[0]!.id;
    const result = nextStarter(starters, 'classmates', 'small', [other], null, () => 0);
    expect(result.seen).toEqual([result.starter!.id]);
  });

  it('works with a single card and with none', () => {
    const one = [starters[0]!];
    expect(nextStarter(one, one[0]!.category, one[0]!.depth, [], one[0]!.id).starter?.id).toBe(one[0]!.id);
    expect(nextStarter([], 'patients', 'small', [], null)).toEqual({ starter: null, seen: [] });
  });

  it('rejects a random function that returns a bad number', () => {
    expect(() => nextStarter(starters, 'patients', 'small', [], null, () => 1)).toThrow();
    expect(() => nextStarter(starters, 'patients', 'small', [], null, () => Number.NaN)).toThrow();
  });
});

describe('get to know yourself cards', () => {
  it('are reflective, gentle and free of advice or health claims', () => {
    expect(isReflective('yourself')).toBe(true);
    expect(isReflective('patients')).toBe(false);
    const avoid = /\b(therap|anxi|depress|trauma|diagnos|mental|disorder|treat|cope|should|heal)/i;
    for (const s of startersFor(starters, 'yourself')) expect(s.text, s.id).not.toMatch(avoid);
  });
});

describe('promptOfTheDay', () => {
  it('gives the same card all day and for everyone, whatever the time of day', () => {
    const morning = promptOfTheDay(starters, new Date(2026, 10, 7, 0, 0, 1));
    const night = promptOfTheDay(starters, new Date(2026, 10, 7, 23, 59, 59));
    expect(morning).toEqual(night);
    expect(morning).not.toBeNull();
  });

  it('changes at the local midnight and does not repeat on neighbouring days', () => {
    const ids = new Set<string>();
    for (let d = 0; d < 60; d++) ids.add(promptOfTheDay(starters, new Date(2026, 10, 1 + d, 12))!.id);
    expect(ids.size).toBe(60);
    expect(promptOfTheDay(starters, new Date(2026, 10, 7, 23, 59))!.id).not.toBe(promptOfTheDay(starters, new Date(2026, 10, 8, 0, 1))!.id);
  });

  it('counts the visitor\'s own calendar date, including across a daylight-saving change', () => {
    expect(dayIndex(new Date(2026, 10, 1, 12))).toBe(0);
    expect(dayIndex(new Date(2027, 2, 14, 0, 30))).toBe(dayIndex(new Date(2027, 2, 13, 23, 30)) + 1);
    expect(dayIndex(new Date(2026, 9, 31, 12))).toBe(-1);
  });

  it('is deterministic regardless of the order the starters come in', () => {
    const date = new Date(2026, 10, 20, 9);
    expect(promptOfTheDay([...starters].reverse(), date)).toEqual(promptOfTheDay(starters, date));
  });

  it('draws from every category over time, including get to know yourself', () => {
    const seen = new Set<string>();
    for (let d = 0; d < 8; d++) seen.add(promptOfTheDay(starters, new Date(2026, 10, 1 + d, 12))!.category);
    expect([...seen].sort()).toEqual([...HELLO_CATEGORIES].sort());
  });

  it('does not crash on empty lists or an empty category', () => {
    expect(promptOfTheDay([], new Date(2026, 10, 7))).toBeNull();
    const onlyTwo = starters.filter((s) => s.category === 'patients' || s.category === 'yourself');
    expect(promptOfTheDay(onlyTwo, new Date(2026, 10, 9))).not.toBeNull();
    expect(startersFor(starters.filter((s) => s.category !== 'yourself'), 'yourself')).toEqual([]);
    expect(nextStarter(starters.filter((s) => s.category !== 'yourself'), 'yourself', 'deep', [], null)).toEqual({ starter: null, seen: [] });
  });
});

describe('depth (small talk and deep convo)', () => {
  it('gives every starter a depth and keeps about half in each, in every category', () => {
    for (const s of starters) expect(HELLO_DEPTHS).toContain(s.depth);
    for (const category of HELLO_CATEGORIES) {
      const small = startersFor(starters, category, 'small').length;
      const deep = startersFor(starters, category, 'deep').length;
      expect(small + deep).toBe(15);
      expect(Math.abs(small - deep)).toBeLessThanOrEqual(1);
    }
  });

  it('filters by depth and category together', () => {
    for (const depth of HELLO_DEPTHS) {
      for (const category of HELLO_CATEGORIES) {
        expect(startersFor(starters, category, depth).every((s) => s.category === category && s.depth === depth)).toBe(true);
        for (const draw of [0, 0.5, 0.99]) {
          expect(nextStarter(starters, category, depth, [], null, () => draw).starter?.depth).toBe(depth);
        }
      }
    }
  });

  it('keeps deep starters gentle', () => {
    const avoid = /\b(trauma|diagnos|religio|church|pray|god|politic|vote|money|income|salary|debt|loss|death|die|grief|abuse|illness|disease|surgery|medic)/i;
    for (const s of starters.filter((x) => x.depth === 'deep')) expect(s.text, s.id).not.toMatch(avoid);
  });

  it('never repeats the card on screen when the depth is switched back and forth', () => {
    let last: string | null = null;
    for (let i = 0; i < 20; i++) {
      const depth = HELLO_DEPTHS[i % 2]!;
      const result = nextStarter(starters, 'patients', depth, [], last, () => 0);
      expect(result.starter!.id).not.toBe(last);
      last = result.starter!.id;
    }
  });

  it('has one daily prompt per depth, each of that depth, stable through the day', () => {
    for (const depth of HELLO_DEPTHS) {
      const ids = new Set<string>();
      for (let d = 0; d < 28; d++) {
        const a = promptOfTheDay(starters, new Date(2026, 10, 1 + d, 0, 5), depth)!;
        const b = promptOfTheDay(starters, new Date(2026, 10, 1 + d, 23, 55), depth)!;
        expect(a).toEqual(b);
        expect(a.depth).toBe(depth);
        ids.add(a.id);
      }
      expect(ids.size).toBe(28);
    }
    expect(promptOfTheDay(starters.filter((s) => s.depth === 'small'), new Date(2026, 10, 7), 'deep')).toBeNull();
  });
});

describe('msUntilNextDay', () => {
  it('counts to the next local midnight', () => {
    expect(msUntilNextDay(new Date(2026, 10, 7, 23, 59, 0))).toBe(60_000);
    expect(msUntilNextDay(new Date(2026, 10, 7, 0, 0, 0))).toBe(86_400_000);
  });
  it('never returns less than a second, so a timer cannot fire before the day changes', () => {
    expect(msUntilNextDay(new Date(2026, 10, 7, 23, 59, 59, 999))).toBe(1000);
  });
});

describe('the all pile (no audience picker)', () => {
  it('draws from every category at the chosen depth', () => {
    expect(startersFor(starters, 'all')).toHaveLength(60);
    for (const depth of HELLO_DEPTHS) {
      const pool = startersFor(starters, 'all', depth);
      expect(pool).toHaveLength(depth === 'small' ? 32 : 28);
      expect(new Set(pool.map((s) => s.category)).size).toBe(4);
    }
  });

  it('walks the whole depth pile before repeating and never repeats the card on screen', () => {
    let seen: string[] = [];
    let last: string | null = null;
    const shown: string[] = [];
    let n = 0;
    for (let i = 0; i < 32; i++) {
      const result = nextStarter(starters, 'all', 'small', seen, last, () => ((n += 11) % 37) / 37);
      expect(result.starter!.id).not.toBe(last);
      shown.push(result.starter!.id);
      seen = result.seen;
      last = result.starter!.id;
    }
    expect(new Set(shown).size).toBe(32);
    expect(nextStarter(starters, 'all', 'small', seen, last, () => 0).starter!.id).not.toBe(last);
    expect(nextStarter([], 'all', 'deep', [], null)).toEqual({ starter: null, seen: [] });
  });
});

describe('release gate: draft samples never become a linked live page', () => {
  const live = { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' };
  it('hides a sample-status file from the live (main) build, however the branch is written', () => {
    expect(helloCardsShown('sample', live)).toBe(false);
    expect(helloCardsShown('sample', { WORKERS_CI: '1', WORKERS_CI_BRANCH: ' refs/heads/main ', CUEORY_ANATOMY_DRAFTS: '1' })).toBe(false);
    expect(helloCardsShown('sample', { WORKERS_CI: '1' })).toBe(false);
    expect(helloCardsShown('sample', {})).toBe(false);
  });
  it('shows samples on staging, previews and builds that ask for drafts, and approved files everywhere', () => {
    expect(helloCardsShown('sample', { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'staging' })).toBe(true);
    expect(helloCardsShown('sample', { CUEORY_ANATOMY_DRAFTS: '1' })).toBe(true);
    expect(helloCardsShown('approved', live)).toBe(true);
  });
  it('the page and the /play link both use the gate, and the seed file is still a sample', () => {
    expect(data.status).toBe('sample');
    for (const file of ['src/pages/play/hello-cards.astro', 'src/pages/play.astro']) {
      expect(readFileSync(file, 'utf8'), file).toContain('helloCardsShown(');
    }
    expect(readFileSync('src/pages/play.astro', 'utf8')).toMatch(/showHello && <section/);
    expect(readFileSync('src/pages/play/hello-cards.astro', 'utf8')).toMatch(/const starters = shown \?/);
  });
});
