import { describe, expect, it } from 'vitest';
import { initialVideoState, nextVideoState, observedVideoEvent, videoStatusText } from '../../src/islands/lessonvideo';

const ID = 'sampleVid01';

describe('lesson video state machine', () => {
  it('shows a static empty state for missing and malformed IDs', () => {
    for (const value of ['', 'short', 'eleven/chars', '../badId123', 'abcdefghijkl']) {
      const state = initialVideoState(value);
      expect(state.phase).toBe('none');
      expect(state.opened).toBe(false);
      expect(videoStatusText(state)).toBe('no video yet.');
      expect(nextVideoState(state, 'play')).toEqual(state);
      expect(nextVideoState(state, 'retry')).toEqual(state);
    }
  });

  it('starts with a ready cover, without opening the player', () => {
    const state = initialVideoState(ID);
    expect(state).toEqual({ videoId: ID, phase: 'ready', opened: false, attempt: 0 });
    expect(videoStatusText(state)).toBe('tap to play the video.');
    expect(nextVideoState(state, 'loaded')).toEqual(state);
    expect(nextVideoState(state, 'retry')).toEqual(state);
  });

  it('one play action opens the frame and reports loading', () => {
    const ready = initialVideoState(ID);
    const loading = nextVideoState(ready, 'play');
    expect(loading).toEqual({ videoId: ID, phase: 'loading', opened: true, attempt: 1 });
    expect(videoStatusText(loading)).toBe('loading the video…');
    expect(nextVideoState(loading, 'play')).toEqual(loading);
  });

  it('a loaded player stays mounted but stops saying loading', () => {
    const loading = nextVideoState(initialVideoState(ID), 'play');
    const ready = nextVideoState(loading, 'loaded');
    expect(ready.phase).toBe('ready');
    expect(ready.opened).toBe(true);
    expect(ready.attempt).toBe(1);
    expect(videoStatusText(ready)).toContain('player ready');
  });

  it('failure restores a real retry path and remounts the iframe', () => {
    const loading = nextVideoState(initialVideoState(ID), 'play');
    const failed = nextVideoState(loading, 'failed');
    expect(failed.phase).toBe('failed');
    expect(failed.opened).toBe(false);
    expect(videoStatusText(failed)).toContain("couldn't load");
    expect(nextVideoState(failed, 'loaded')).toEqual(failed);
    const retrying = nextVideoState(failed, 'retry');
    expect(retrying.phase).toBe('loading');
    expect(retrying.opened).toBe(true);
    expect(retrying.attempt).toBe(2);
    expect(nextVideoState(retrying, 'loaded').phase).toBe('ready');
  });

  it('manual retry is possible when the iframe loaded but playback did not start', () => {
    const playing = nextVideoState(nextVideoState(initialVideoState(ID), 'play'), 'loaded');
    const retried = nextVideoState(playing, 'retry');
    expect(retried.attempt).toBe(2);
    expect(retried.phase).toBe('loading');
  });
});

describe('guarding iframe events and stalled loads', () => {
  it('ignores a late event from an earlier attempt after retry', () => {
    const first = nextVideoState(initialVideoState(ID), 'play');
    const retry = nextVideoState(nextVideoState(first, 'failed'), 'retry');
    expect(observedVideoEvent(retry, ID, first.attempt, 'loaded')).toEqual(retry);
    expect(observedVideoEvent(retry, ID, first.attempt, 'failed')).toEqual(retry);
    expect(observedVideoEvent(retry, ID, first.attempt, 'stalled')).toEqual(retry);
    expect(observedVideoEvent(retry, ID, retry.attempt, 'loaded').phase).toBe('ready');
  });

  it('never accepts events from another video ID or from a closed cover', () => {
    const open = nextVideoState(initialVideoState(ID), 'play');
    const other = 'anotherVid1';
    expect(other).toHaveLength(11);
    expect(observedVideoEvent(open, other, open.attempt, 'loaded')).toEqual(open);
    expect(observedVideoEvent(initialVideoState(ID), ID, 0, 'loaded')).toEqual(initialVideoState(ID));
  });

  it('stalled loading fails, but the same timeout cannot undo a successful load', () => {
    const loading = nextVideoState(initialVideoState(ID), 'play');
    const finished = observedVideoEvent(loading, ID, loading.attempt, 'loaded');
    expect(observedVideoEvent(finished, ID, loading.attempt, 'stalled')).toEqual(finished);
    const failed = observedVideoEvent(loading, ID, loading.attempt, 'stalled');
    expect(failed).toEqual({ ...loading, phase: 'failed', opened: false });
    expect(videoStatusText(failed)).toBe("the video couldn't load. try again.");
    expect(observedVideoEvent(failed, ID, loading.attempt, 'loaded')).toEqual(failed);
  });
});
