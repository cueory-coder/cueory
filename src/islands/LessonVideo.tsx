import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { initialVideoState, nextVideoState, observedVideoEvent, videoStatusText, type VideoEvent } from './lessonvideo';

interface Props {
  videoId: string;
  title: string;
  /** Self-hosted cover image path (D-40). Without it the drawn cover shows. */
  thumbnail?: string;
  captionsUrl?: string;
  transcriptUrl?: string;
}

/**
 * Lazy YouTube Nocookie embed (D-82). No external request occurs before a student taps.
 * The tap mounts an autoplay iframe synchronously, preserving Safari's user gesture.
 */
export default function LessonVideo({ videoId, title, thumbnail, captionsUrl, transcriptUrl }: Props) {
  const [saved, setSaved] = useState(() => initialVideoState(videoId));
  const frameRef = useRef<HTMLIFrameElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);

  // Guard against an ID change: the old open player must never auto-load a new ID before another tap.
  const view = saved.videoId === videoId ? saved : initialVideoState(videoId);
  const frameVisible = view.opened && (view.phase === 'loading' || view.phase === 'ready');

  useEffect(() => {
    if (saved.videoId !== videoId) setSaved(initialVideoState(videoId));
  }, [saved.videoId, videoId]);

  // The tapped cover unmounts. Keep the keyboard in the player, then on the retry button if loading fails.
  useEffect(() => {
    if (frameVisible) frameRef.current?.focus();
  }, [frameVisible, view.attempt]);
  useEffect(() => {
    if (view.phase === 'failed') retryRef.current?.focus();
  }, [view.phase]);

  // Some browsers do not fire iframe error events for cross-origin failures. A stalled load has a retry state.
  useEffect(() => {
    if (view.phase !== 'loading') return;
    const attempt = view.attempt;
    const timeout = window.setTimeout(() => {
      setSaved((current) => observedVideoEvent(current, videoId, attempt, 'stalled'));
    }, 20_000);
    return () => window.clearTimeout(timeout);
  }, [view.phase, view.attempt, videoId]);

  // Keep this handler synchronous. No await/timer/network work before the iframe mounts (D-40).
  function start(event: 'play' | 'retry') {
    flushSync(() => {
      setSaved((current) => nextVideoState(
        current.videoId === videoId ? current : initialVideoState(videoId), event,
      ));
    });
  }

  function onFrame(event: Extract<VideoEvent, 'loaded' | 'failed'>, attempt: number) {
    setSaved((current) => observedVideoEvent(current, videoId, attempt, event));
  }

  return (
    <div className="space-y-3">
      {view.phase === 'none' ? (
        <p className="rounded-lg border border-line bg-surface p-5 text-sm text-ink">no video yet.</p>
      ) : frameVisible ? (
        <div className="relative aspect-video min-h-50 w-full overflow-hidden rounded-lg bg-player">
          <iframe
            key={view.attempt}
            ref={frameRef}
            className="absolute inset-0 size-full"
            src={'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(videoId) + '?autoplay=1'}
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            onLoad={() => onFrame('loaded', view.attempt)}
            onError={() => onFrame('failed', view.attempt)}
          />
        </div>
      ) : view.phase === 'failed' ? (
        <button
          ref={retryRef}
          type="button"
          onClick={() => start('retry')}
          className="min-h-11 min-w-11 rounded-pill bg-button px-5 py-3 text-on-button hover:bg-button-hover"
        >
          try again
        </button>
      ) : (
        <button
          type="button"
          onClick={() => start('play')}
          className="group relative aspect-video min-h-50 w-full overflow-hidden rounded-lg bg-ink-soft/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-button"
          aria-label={'Play video: ' + title}
        >
          {thumbnail ? (
            <img src={thumbnail} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
          ) : (
            <svg
              viewBox="0 0 640 360"
              aria-hidden="true"
              className="size-full"
              preserveAspectRatio="xMidYMid slice"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect width="640" height="360" fill="currentColor" className="text-ink-soft/10" />
              <rect x="20" y="20" width="600" height="320" rx="4" fill="currentColor" className="text-ink-soft/5" />
              <circle cx="320" cy="180" r="52" fill="currentColor" className="text-ink-soft/20" />
              <polygon points="308,157 308,203 348,180" fill="currentColor" className="text-ink-soft/60" />
              <text
                x="320"
                y="284"
                textAnchor="middle"
                fill="currentColor"
                className="text-sm text-ink-soft"
                fontFamily="inherit"
              >
                Placeholder — real video coming soon
              </text>
            </svg>
          )}

          {/* Play button overlay */}
          <span className="absolute inset-0 flex items-center justify-center">
            <span
              className="flex size-16 items-center justify-center rounded-full bg-button text-on-button shadow-button group-hover:bg-button-hover group-focus-visible:bg-button-hover"
              aria-hidden="true"
            >
              <svg viewBox="0 0 24 24" className="size-8 translate-x-0.5" aria-hidden="true">
                <polygon points="6,4 20,12 6,20" fill="currentColor" />
              </svg>
            </span>
          </span>
        </button>
      )}

      {view.phase !== 'none' && (
        <>
          <p role="status" aria-live="polite" className="text-sm text-ink-soft">{videoStatusText(view)}</p>
          {frameVisible && (
            <button
              type="button"
              onClick={() => start('retry')}
              className="min-h-11 min-w-11 rounded-pill border border-control px-5 py-2.5 text-sm text-ink hover:bg-surface"
            >
              video not working? try again
            </button>
          )}
          <p className="text-sm text-ink-soft">
            Tapping play loads YouTube and its cookies. <a href="/privacy">See the privacy page.</a>
          </p>
        </>
      )}
      {(captionsUrl || transcriptUrl) && (
        <ul className="flex gap-4 text-sm">
          {captionsUrl && <li><a href={captionsUrl}>Captions</a></li>}
          {transcriptUrl && <li><a href={transcriptUrl}>Transcript</a></li>}
        </ul>
      )}
    </div>
  );
}
