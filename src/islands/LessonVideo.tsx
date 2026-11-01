import { useState } from 'react';

interface Props {
  videoId: string;
  title: string;
  captionsUrl?: string;
  transcriptUrl?: string;
}

/**
 * Lazy YouTube Nocookie embed (D-82). Nothing loads from YouTube before the student taps the cover.
 * On tap the player swaps in with autoplay on; the cover disappears.
 * Rendered only in the browser (client:only).
 */
export default function LessonVideo({ videoId, title, captionsUrl, transcriptUrl }: Props) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <div className="space-y-3">
        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
          <iframe
            className="absolute inset-0 size-full"
            src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1`}
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>
        <p className="text-sm text-ink-soft">
          Playing this video loads YouTube and its cookies.{' '}
          <a href="/privacy">See the privacy page.</a>
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

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      className="group relative aspect-video w-full overflow-hidden rounded-lg bg-ink-soft/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-button"
      aria-label={`Play video: ${title}`}
    >
      {/* Placeholder thumbnail drawn in SVG. Replace with a real thumbnail when publishing. */}
      <svg
        viewBox="0 0 640 360"
        aria-hidden="true"
        className="size-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="640" height="360" fill="currentColor" className="text-ink-soft/10" />
        <rect x="20" y="20" width="600" height="320" rx="4" fill="currentColor" className="text-ink-soft/5" />
        {/* Simple play-button placeholder mark */}
        <circle cx="320" cy="180" r="52" fill="currentColor" className="text-ink-soft/20" />
        <polygon points="308,157 308,203 348,180" fill="currentColor" className="text-ink-soft/60" />
        <text
          x="320"
          y="284"
          textAnchor="middle"
          fontSize="14"
          fill="currentColor"
          className="text-ink-soft"
          fontFamily="inherit"
        >
          Placeholder — real video coming soon
        </text>
      </svg>

      {/* Play button overlay */}
      <span className="absolute inset-0 flex items-center justify-center">
        <span
          className="flex size-16 items-center justify-center rounded-full bg-button text-on-button shadow-md group-hover:bg-button-hover group-focus-visible:bg-button-hover"
          aria-hidden="true"
        >
          {/* Triangle play icon */}
          <svg viewBox="0 0 24 24" className="size-8 translate-x-0.5" aria-hidden="true">
            <polygon points="6,4 20,12 6,20" fill="currentColor" />
          </svg>
        </span>
      </span>
    </button>
  );
}
