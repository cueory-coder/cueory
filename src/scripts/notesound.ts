import type { KeyValueStorage } from './storage';

export const NOTE_SOUND_STORAGE_KEY = 'cueory-note-sound';
export const SOUND_VOLUME = 0.35;
export const NOTE_SOUNDS = { appear: 'snap', leave: 'stretch' } as const;

export interface NoteSoundState {
  /** Missing means the default setting, on. */
  soundOn?: boolean;
  hasInteracted: boolean;
  lessonVideoPlaying: boolean;
  tabVisible: boolean;
  reducedMotion: boolean;
  playedForNote: boolean;
  /** False until Christian's recordings exist. */
  filesExist: boolean;
  /** A known browser refusal stays a refusal; this helper never attempts playback. */
  browserBlocked?: boolean;
}

/** Pure permission check for a glove note. No audio, DOM or browser-policy workarounds. */
export function maySoundPlay(state: NoteSoundState): boolean {
  return (state.soundOn === undefined || state.soundOn === true)
    && state.hasInteracted === true
    && state.lessonVideoPlaying === false
    && state.tabVisible === true
    && state.reducedMotion === false
    && state.playedForNote === false
    && state.filesExist === true
    && state.browserBlocked !== true;
}

/** Only the exact saved values are understood. Missing, malformed or blocked storage defaults to on. */
export function readSoundSetting(storage?: KeyValueStorage): boolean {
  try {
    const value = storage?.getItem(NOTE_SOUND_STORAGE_KEY);
    return value === 'off' ? false : true;
  } catch {
    return true;
  }
}

/** The caller keeps the current toggle in memory even when the browser cannot save it. */
export function writeSoundSetting(storage: KeyValueStorage | undefined, on: boolean): void {
  try {
    storage?.setItem(NOTE_SOUND_STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // Saving a preference must never prevent the note or its buttons from working.
  }
}
