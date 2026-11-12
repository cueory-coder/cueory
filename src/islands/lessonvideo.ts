/** Pure UI states for the click-to-play lesson video. Never performs network requests. */
export type VideoPhase = 'none' | 'ready' | 'loading' | 'failed';
export type VideoEvent = 'play' | 'retry' | 'loaded' | 'failed';

export interface VideoState {
  videoId: string;
  phase: VideoPhase;
  /** Keeps the iframe mounted after it loads; a ready cover has opened=false. */
  opened: boolean;
  /** Changing the attempt remounts the iframe on each retry. */
  attempt: number;
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** No player is created for a missing or invalid ID. Match the published-video schema. */
export function initialVideoState(videoId: string): VideoState {
  return { videoId, phase: VIDEO_ID.test(videoId) ? 'ready' : 'none', opened: false, attempt: 0 };
}

/** Every player transition is a pure function and is valid only from the expected state. */
export function nextVideoState(state: VideoState, event: VideoEvent): VideoState {
  if (state.phase === 'none') return state;
  switch (event) {
    case 'play':
      return state.phase === 'ready' && !state.opened
        ? { ...state, phase: 'loading', opened: true, attempt: state.attempt + 1 }
        : state;
    case 'retry':
      return state.phase === 'failed' || state.opened
        ? { ...state, phase: 'loading', opened: true, attempt: state.attempt + 1 }
        : state;
    case 'loaded':
      return state.phase === 'loading' && state.opened ? { ...state, phase: 'ready' } : state;
    case 'failed':
      return state.opened ? { ...state, phase: 'failed', opened: false } : state;
  }
}

/** Visible status words always accompany the cover, iframe or retry button. */
export function videoStatusText(state: VideoState): string {
  switch (state.phase) {
    case 'none': return 'no video yet.';
    case 'loading': return 'loading the video…';
    case 'failed': return "the video couldn't load. try again.";
    // iframe onLoad can fire even when loading fails, so never claim that playback is verified.
    case 'ready': return state.opened ? "the video window opened. if it doesn't play, try again." : 'tap to play the video.';
  }
}

/**
 * Accept events only from the current iframe attempt and video.
 * A stale 20-second timeout must never undo a successful load.
 */
export function observedVideoEvent(
  state: VideoState, videoId: string, attempt: number, event: 'loaded' | 'failed' | 'stalled',
): VideoState {
  if (state.videoId !== videoId || state.attempt !== attempt || !state.opened) return state;
  if (event === 'stalled' && state.phase !== 'loading') return state;
  return nextVideoState(state, event === 'stalled' ? 'failed' : event);
}
