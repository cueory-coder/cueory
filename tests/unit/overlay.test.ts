import { describe, expect, it } from 'vitest';
import { initialState, liveText, selectView, toggleView } from '../../src/visuals/overlay';
import { OVERLAY_NOTE } from '../../src/visuals/sources';

describe('initialState', () => {
  it('starts on the healthy view', () => {
    expect(initialState().view).toBe('healthy');
  });
});

describe('selectView', () => {
  it('selects healthy', () => {
    expect(selectView('healthy').view).toBe('healthy');
  });

  it('selects changed', () => {
    expect(selectView('changed').view).toBe('changed');
  });

  it('returns a new object (does not mutate input)', () => {
    const before = initialState();
    const after = selectView('changed');
    expect(before.view).toBe('healthy');
    expect(after).not.toBe(before);
  });
});

describe('toggleView', () => {
  it('switches from healthy to changed', () => {
    expect(toggleView({ view: 'healthy' }).view).toBe('changed');
  });

  it('switches from changed to healthy', () => {
    expect(toggleView({ view: 'changed' }).view).toBe('healthy');
  });

  it('does not mutate the input state', () => {
    const state = { view: 'healthy' as const };
    toggleView(state);
    expect(state.view).toBe('healthy');
  });

  it('toggling twice returns to the original view', () => {
    const start = initialState();
    const toggled = toggleView(toggleView(start));
    expect(toggled.view).toBe(start.view);
  });
});

describe('liveText', () => {
  it('announces "Showing healthy" when on the healthy view', () => {
    const text = liveText({ view: 'healthy' }, 'sample: narrowed');
    expect(text).toBe('Showing healthy');
  });

  it('includes the changedName when on the changed view', () => {
    const text = liveText({ view: 'changed' }, 'sample: narrowed');
    expect(text).toContain('sample: narrowed');
  });

  it('does not say "healthy" when on the changed view', () => {
    const text = liveText({ view: 'changed' }, 'sample: narrowed');
    expect(text.toLowerCase()).not.toContain('healthy');
  });
});

describe('OVERLAY_NOTE', () => {
  it('is the canonical simplified-for-learning note from sources.ts', () => {
    expect(OVERLAY_NOTE).toBe('simplified for learning');
  });
});
