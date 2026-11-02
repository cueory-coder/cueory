import { useId, useRef, useState } from 'react';
import {
  buildShareText,
  buildShareUrl,
  canNativeShare,
  SCENE_COLORS,
  SHARE_STYLES,
  shareImagePath,
  STYLE_LABELS,
  xIntentUrl,
  type ShareStyle,
  type ShareToolId,
} from './share';

/** X logo path from simple-icons@16.36.0 */
const X_PATH =
  'M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.097 13.233L.258 23.764h2.072l7.95-9.237 6.35 9.237h6.993L14.234 10.162Zm-2.814 3.27-.922-1.317L2.827 1.544H6.26l5.919 8.462.922 1.317 7.695 11.003h-3.433l-6.943-9.894Z';

/** Link SVG path (generic) */
const LINK_PATH =
  'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71';

/** Check-mark SVG path */
const CHECK_PATH = 'M20 6 9 17l-5-5';

interface Props {
  tool: ShareToolId;
  siteUrl: string;
}

export default function ShareSheet({ tool, siteUrl }: Props) {
  const id = useId();
  const [style, setStyle] = useState<ShareStyle>('scene');
  const [copied, setCopied] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  const styleIdx = SHARE_STYLES.indexOf(style);
  const shareUrl = buildShareUrl(tool, siteUrl);
  const shareText = buildShareText(tool);

  function scrollTo(idx: number) {
    const next = SHARE_STYLES[idx];
    if (!next) return;
    setStyle(next);
    const row = rowRef.current;
    if (row) {
      const card = row.children[idx] as HTMLElement | undefined;
      card?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }

  async function handleNativeShare() {
    if (!canNativeShare()) return;
    try {
      await navigator.share({ title: 'Cueory', text: shareText, url: shareUrl });
    } catch {
      // dismissed or failed — nothing to show
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  }

  const btn =
    'flex min-h-11 min-w-11 items-center gap-2 rounded-full border border-control px-5 py-2.5 text-sm font-medium text-ink hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

  return (
    <div className="flex flex-col items-center gap-6">
      {/* card style picker */}
      <div className="relative w-full">
        <div
          ref={rowRef}
          role="radiogroup"
          aria-labelledby={`${id}-label`}
          className="flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-p-4 px-4 pb-3 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {SHARE_STYLES.map((s, i) => (
            <CardOption
              key={s}
              id={`${id}-${s}`}
              style={s}
              tool={tool}
              checked={style === s}
              onChange={() => scrollTo(i)}
            />
          ))}
        </div>

        {/* prev arrow */}
        {styleIdx > 0 && (
          <ArrowButton
            direction="prev"
            label="previous style"
            onClick={() => scrollTo(styleIdx - 1)}
          />
        )}
        {/* next arrow */}
        {styleIdx < SHARE_STYLES.length - 1 && (
          <ArrowButton
            direction="next"
            label="next style"
            onClick={() => scrollTo(styleIdx + 1)}
          />
        )}
      </div>

      {/* dot indicators */}
      <div role="presentation" className="flex gap-2">
        {SHARE_STYLES.map((s, i) => (
          <div
            key={s}
            className={`h-1.5 rounded-full transition-all ${i === styleIdx ? 'w-4 bg-ink' : 'w-1.5 bg-soft'}`}
          />
        ))}
      </div>

      {/* share actions */}
      <div className="flex flex-wrap justify-center gap-3">
        {canNativeShare() && (
          <button type="button" className={btn} onClick={handleNativeShare}>
            <ShareIcon />
            share…
          </button>
        )}
        <a
          href={xIntentUrl(shareText, shareUrl)}
          target="_blank"
          rel="noopener noreferrer"
          className={btn}
          aria-label="post on X (opens in new tab)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 shrink-0 fill-ink">
            <path d={X_PATH} />
          </svg>
          post on X
        </a>
        <button type="button" className={btn} onClick={handleCopy} aria-live="polite">
          {copied ? (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-5 w-5 shrink-0">
                <path d={CHECK_PATH} />
              </svg>
              copied
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-5 w-5 shrink-0">
                <path d={LINK_PATH} />
              </svg>
              copy link
            </>
          )}
        </button>
      </div>
    </div>
  );
}

interface CardOptionProps {
  id: string;
  style: ShareStyle;
  tool: ShareToolId;
  checked: boolean;
  onChange: () => void;
}

function CardOption({ id, style, tool, checked, onChange }: CardOptionProps) {
  return (
    <label htmlFor={id} className="shrink-0 snap-center cursor-pointer">
      <input
        id={id}
        type="radio"
        name={`${id}-style`}
        value={style}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      <div
        className={`relative overflow-hidden rounded-2xl transition-all ${
          checked ? 'ring-2 ring-ink ring-offset-2' : 'ring-1 ring-line'
        }`}
        style={{ width: 280, height: 147 }}
        aria-label={STYLE_LABELS[style]}
      >
        <img
          src={shareImagePath(tool, style)}
          alt={STYLE_LABELS[style]}
          width={280}
          height={147}
          className="h-full w-full object-cover"
          loading="eager"
          decoding="async"
          draggable={false}
        />
      </div>
      <p className="mt-2 text-center text-sm text-ink-soft">{STYLE_LABELS[style]}</p>
    </label>
  );
}

function ArrowButton({ direction, label, onClick }: { direction: 'prev' | 'next'; label: string; onClick: () => void }) {
  const isPrev = direction === 'prev';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`absolute top-1/2 -translate-y-1/2 ${isPrev ? 'left-0' : 'right-0'} flex h-9 w-9 items-center justify-center rounded-full bg-surface/90 text-ink shadow-sm backdrop-blur-sm hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-4 w-4">
        {isPrev ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
      </svg>
    </button>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-5 w-5 shrink-0">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}
