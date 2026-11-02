import { describe, expect, it, vi } from 'vitest';
import {
  maySoundPlay, NOTE_SOUND_STORAGE_KEY, NOTE_SOUNDS, readSoundSetting, SOUND_VOLUME, writeSoundSetting,
  type NoteSoundState,
} from '../../src/scripts/notesound';
import type { KeyValueStorage } from '../../src/scripts/storage';

const ready: Readonly<NoteSoundState> = Object.freeze({
  soundOn: true, hasInteracted: true, lessonVideoPlaying: false, tabVisible: true,
  reducedMotion: false, playedForNote: false, filesExist: true,
});

describe('glove note sound permission', () => {
  it('allows a quiet sound only after all gates are met, with the setting on by default', () => {
    expect(maySoundPlay(ready)).toBe(true);
    expect(maySoundPlay({ ...ready, soundOn: undefined })).toBe(true);
    expect(SOUND_VOLUME).toBe(0.35);
    expect(NOTE_SOUNDS).toEqual({ appear: 'snap', leave: 'stretch' });
  });

  it.each([
    ['soundOn', false], ['hasInteracted', false], ['lessonVideoPlaying', true], ['tabVisible', false],
    ['reducedMotion', true], ['playedForNote', true], ['filesExist', false], ['browserBlocked', true],
  ] as const)('keeps a glove note silent when %s is %s', (key, value) => {
    expect(maySoundPlay({ ...ready, [key]: value })).toBe(false);
  });

  it('never attempts audio or a workaround when a browser has blocked playback', () => {
    const audio = vi.fn(() => { throw new Error('blocked'); });
    vi.stubGlobal('Audio', audio);
    try {
      expect(maySoundPlay({ ...ready, browserBlocked: true })).toBe(false);
      expect(maySoundPlay({ ...ready, hasInteracted: false })).toBe(false);
      expect(audio).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps repeated decisions pure and never resets a played note or a known refusal', () => {
    const played = Object.freeze({ ...ready, playedForNote: true });
    const blocked = Object.freeze({ ...ready, browserBlocked: true });
    for (let i = 0; i < 3; i++) {
      expect(maySoundPlay(played)).toBe(false);
      expect(maySoundPlay(blocked)).toBe(false);
    }
    expect(played.playedForNote).toBe(true);
    expect(blocked.browserBlocked).toBe(true);
  });
});

function memory(value: string | null) {
  const values = new Map<string, string>();
  if (value !== null) values.set(NOTE_SOUND_STORAGE_KEY, value);
  const storage: KeyValueStorage = {
    getItem: vi.fn(key => values.get(key) ?? null),
    setItem: vi.fn((key, next) => { values.set(key, next); }),
    removeItem: vi.fn(),
  };
  return storage;
}

describe('glove note sound preference', () => {
  it.each([
    ['on', true], ['off', false], [null, true], ['', true], ['false', true], ['OFF', true],
    [' off ', true], ['0', true], ['{"on":false}', true],
  ] as const)('reads only exact saved values and defaults malformed values to on: %j', (value, expected) => {
    const storage = memory(value);
    expect(readSoundSetting(storage)).toBe(expected);
    expect(storage.getItem).toHaveBeenCalledWith('cueory-note-sound');
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it('writes only on or off under its own key and reads the choice back', () => {
    const storage = memory(null);
    writeSoundSetting(storage, false);
    expect(storage.setItem).toHaveBeenLastCalledWith('cueory-note-sound', 'off');
    expect(readSoundSetting(storage)).toBe(false);
    writeSoundSetting(storage, true);
    expect(storage.setItem).toHaveBeenLastCalledWith('cueory-note-sound', 'on');
    expect(readSoundSetting(storage)).toBe(true);
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it('works without storage and stays quiet when reads or writes are blocked', () => {
    const blocked: KeyValueStorage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('unused'); },
    };
    expect(readSoundSetting()).toBe(true);
    expect(readSoundSetting(blocked)).toBe(true);
    expect(() => writeSoundSetting(undefined, false)).not.toThrow();
    expect(() => writeSoundSetting(blocked, false)).not.toThrow();
    expect(maySoundPlay({ ...ready, soundOn: false })).toBe(false);
  });
});
