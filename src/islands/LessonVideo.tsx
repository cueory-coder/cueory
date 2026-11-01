import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

interface Props {
  videoId: string;
  title: string;
  /** Self-hosted cover image path (D-40). Without it the drawn cover shows. */
  thumbnail?: string;
  captionsUrl?: string;
  transcriptUrl?: string;
}

/**
 * Lazy YouTube Nocookie embed (D-82). Nothing loads from YouTube before the student taps the cover.
 * One tap creates the player with autoplay on and the cover goes away.
 * Rendered only in the browser (client:only).
 */
export default function LessonVideo({ videoId, title, thumbnail, captionsUrl, transcriptUrl }: Props) {
  const [playing, setPlaying] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);

  // The play button unmounts on tap, so focus would fall to the page body. Move it to the player.
  useEffect(() => {
    if (playing) frameRef.current?.focus();
  }, [playing]);

  // The single-tap start rule (D-40): keep this handler synchronous. No await, timer or fetch before the iframe
  // is created, because Safari/iOS can drop the "user tapped" permission that autoplay needs.
  // TO CHECK ON A REAL iPhone before launch: one tap must start the video with sound controls working.
  function play() {
    flushSync(() => setPlaying(true));
  }

  return (
    <div className="space-y-3">
      {playing ? (
        <div className="relative aspect-video min-h-50 w-full overflow-hidden rounded-lg bg-player">
          <iframe
            ref={frameRef}
            className="absolute inset-0 size-full"
            src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1`}
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={play}
          className="group relative aspect-video min-h-50 w-full overflow-hidden rounded-lg bg-ink-soft/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-button"
          aria-label={`Play video: ${title}`}
        >
          {thumbnail ? (
            <img src={thumbnail} alt="" className="size-full object-cover" />
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

      {/* Shown before the tap, so the student knows what a tap does. */}
      <p className="text-sm text-ink-soft">
        Tapping play loads YouTube and its cookies. <a href="/privacy">See the privacy page.</a>
      </p>
      {(captionsUrl || transcriptUrl) && (
        <ul className="flex gap-4 text-sm">
          {captionsUrl && <li><a href={captionsUrl}>Captions</a></li>}
          {transcriptUrl && <li><a href={transcriptUrl}>Transcript</a></li>}
        </ul>
      )}
    </div>
  );
}
