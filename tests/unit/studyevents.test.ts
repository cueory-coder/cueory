import { describe, expect, it } from 'vitest';
import { dailyGames } from '../../src/config/games';
import { studyModes } from '../../src/config/modes';
import { MAX_COUNT, studyEvent } from '../../src/islands/studyevents';

describe('allowed study events', () => {
  it.each([
    ['mode_started', { mode: 'cards', lesson_id: 'sample-lesson', deck_id: 'sample-deck', item_count: 8 }],
    ['mode_finished', { mode: 'learn', lesson_id: 'sample-lesson', deck_id: 'sample-deck', item_count: 8, correct_count: 6 }],
    ['card_flipped', { mode: 'cards', deck_id: 'sample-deck', card_id: 'sample-card' }],
    ['question_checked', { mode: 'questions', item_id: '00000000-0000-4000-8000-0000000000e1', correct: false }],
    ['game_finished', { game: dailyGames[0]!.id, solved: true, attempts: 7 }],
    ['diagram_step', { diagram_id: 'sample-diagram', step: 0 }],
  ])('keeps only the declared shape for %s', (name, props) => {
    expect(studyEvent(name, props)).toEqual({ ok: true, event: { name, properties: props }, dropped: [] });
  });

  it('does not invent ids, timestamps or properties when none were supplied', () => {
    expect(studyEvent('card_flipped')).toEqual({
      ok: true, event: { name: 'card_flipped', properties: {} }, dropped: [],
    });
  });

  it('uses every configured mode and game id rather than display names', () => {
    for (const { id } of studyModes) {
      expect(studyEvent('mode_started', { mode: id })).toMatchObject({ event: { properties: { mode: id } }, dropped: [] });
    }
    for (const { id } of dailyGames) {
      expect(studyEvent('game_finished', { game: id })).toMatchObject({ event: { properties: { game: id } }, dropped: [] });
    }
    expect(studyEvent('mode_started', { mode: 'sample: invented mode' })).toMatchObject({ event: { properties: {} }, dropped: ['mode'] });
    expect(studyEvent('game_finished', { game: 'sample: invented game' })).toMatchObject({ event: { properties: {} }, dropped: ['game'] });
  });
});

describe('personal and unrelated properties stay out of the event', () => {
  it('drops and lists identity, free text and date fields without returning their values', () => {
    const input = {
      mode: 'cards', email: 'sample@example.invalid', display_name: 'Sample Person',
      name: 'Sample Person', text: 'sample: a private note', date_of_birth: '2000-01-01',
      user_id: 'sample-user', device_id: 'sample-device', timestamp: '2026-11-01T00:00:00Z',
    };
    const result = studyEvent('mode_started', input);
    expect(result).toEqual({ ok: true, event: { name: 'mode_started', properties: { mode: 'cards' } },
      dropped: ['date_of_birth', 'device_id', 'display_name', 'email', 'name', 'text', 'timestamp', 'user_id'] });
    expect(JSON.stringify(result)).not.toContain('Sample Person');
    expect(JSON.stringify(result)).not.toContain('sample@example.invalid');
    expect(JSON.stringify(result)).not.toContain('2000-01-01');
  });

  it.each([
    'sample@example.invalid', 'Sample Person', 'sample person', '2000-01-01',
    '1234567890', 'https://example.invalid', 'sample\nprivate', '', 'a'.repeat(81),
  ])('refuses text that is not a bounded machine identifier: %j', value => {
    const result = studyEvent('card_flipped', { card_id: value });
    expect(result).toEqual({ ok: true, event: { name: 'card_flipped', properties: {} }, dropped: ['card_id'] });
  });

  it('does not accept a field merely because another event permits it', () => {
    expect(studyEvent('card_flipped', { card_id: 'sample-card', correct: true, attempts: 1, step: 1 }))
      .toEqual({ ok: true, event: { name: 'card_flipped', properties: { card_id: 'sample-card' } },
        dropped: ['attempts', 'correct', 'step'] });
  });

  it.each(['sample-card', '00000000-0000-4000-8000-000000000001', 'AABBCCDD-0000-4000-8000-000000000001'])(
    'keeps a content slug or UUID, including an all-numeric UUID: %s', card_id => {
      expect(studyEvent('card_flipped', { card_id })).toMatchObject({ event: { properties: { card_id } }, dropped: [] });
    },
  );

  it('rejects nested values rather than forwarding any part of them', () => {
    expect(studyEvent('question_checked', { item_id: { email: 'sample@example.invalid' }, correct: [true] }))
      .toEqual({ ok: true, event: { name: 'question_checked', properties: {} }, dropped: ['correct', 'item_id'] });
  });

  it('ignores inherited properties and treats prototype names as unknown fields', () => {
    const props = Object.create({ email: 'sample@example.invalid', mode: 'cards' });
    props.item_count = 3;
    expect(studyEvent('mode_started', props)).toMatchObject({ event: { properties: { item_count: 3 } }, dropped: [] });
    const unusual = JSON.parse('{"__proto__":{"polluted":true},"constructor":"sample","toString":"sample","step":1}');
    const result = studyEvent('diagram_step', unusual);
    expect(result).toEqual({ ok: true, event: { name: 'diagram_step', properties: { step: 1 } },
      dropped: ['__proto__', 'constructor', 'toString'] });
    expect(Object.hasOwn({}, 'polluted')).toBe(false);
  });

  it('does not mutate or retain input objects', () => {
    const input = Object.freeze({ mode: 'cards', item_count: 4, email: 'sample@example.invalid' });
    const result = studyEvent('mode_started', input);
    expect(input).toEqual({ mode: 'cards', item_count: 4, email: 'sample@example.invalid' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    result.event.properties.item_count = 7;
    expect(input.item_count).toBe(4);
  });
});

describe('counts and booleans', () => {
  it.each([-1, 0.5, NaN, Infinity, -Infinity, MAX_COUNT + 1, Number.MAX_SAFE_INTEGER, '3', null])(
    'drops invalid or oversized counts: %j', value => {
      expect(studyEvent('mode_finished', { item_count: value, correct_count: value })).toMatchObject({
        event: { properties: {} }, dropped: ['correct_count', 'item_count'],
      });
      expect(studyEvent('game_finished', { attempts: value })).toMatchObject({ dropped: ['attempts'] });
      expect(studyEvent('diagram_step', { step: value })).toMatchObject({ dropped: ['step'] });
    },
  );

  it.each([0, MAX_COUNT])('accepts the inclusive count boundary %s', value => {
    expect(studyEvent('mode_finished', { item_count: value, correct_count: value })).toMatchObject({
      event: { properties: { item_count: value, correct_count: value } }, dropped: [],
    });
  });

  it.each([true, false])('preserves the boolean %s', value => {
    expect(studyEvent('question_checked', { correct: value })).toMatchObject({ event: { properties: { correct: value } }, dropped: [] });
    expect(studyEvent('game_finished', { solved: value })).toMatchObject({ event: { properties: { solved: value } }, dropped: [] });
  });

  it.each([0, 1, 'true', 'false', null])('does not coerce %j to a boolean', value => {
    expect(studyEvent('question_checked', { correct: value })).toMatchObject({ event: { properties: {} }, dropped: ['correct'] });
  });
});

describe('invalid event inputs', () => {
  it.each(['unknown', '__proto__', 'constructor', 'toString', 'sample@example.invalid', null, 7])(
    'refuses an unknown event without echoing it: %j', name => {
      expect(studyEvent(name, {})).toEqual({ ok: false, message: 'Unknown study event.' });
    },
  );

  it.each([null, [], 'sample: text', 7, true])('refuses non-object properties: %j', props => {
    expect(studyEvent('mode_started', props)).toEqual({ ok: false, message: 'Event properties must be an object.' });
  });

  it('does not expose an exception or partial values from unreadable properties', () => {
    const props = { get mode() { throw new Error('sample@example.invalid'); } };
    expect(studyEvent('mode_started', props)).toEqual({ ok: false, message: 'Event properties could not be read.' });
  });
});
