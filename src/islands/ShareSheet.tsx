import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  buildShareData,
  buildShareText,
  buildShareUrl,
  canNativeShare,
  canShareFiles,
  centeredScrollLeft,
  loadCardFile,
  runShare,
  scrollBehavior,
  SHARE_STYLES,
  shareFileName,
  shareImagePath,
  STYLE_LABELS,
  toolName,
  xIntentUrl,
  type ShareOutcome,
  type ShareStyle,
  type ShareToolId,
} from './share';

/*
  The share sheet (Task 103): pick a card style, like Spotify's share sheet, then share it. The link always goes to the
  tool the achievement came from. No social SDKs, scripts or tracking: the system share sheet, a plain X post link and
  copy link. Icons are single-color outlines in Espresso (ink) inside round rings (Christian, 2026-11-01).
*/

/** X logo, simple-icons 16.36.0 (CC0). A one-color glyph. */
const X_PATH =
  'M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.097 13.233L.258 23.764h2.072l7.95-9.237 6.35 9.237h6.993L14.234 10.162Zm-2.814 3.27-.922-1.317L2.827 1.544H6.26l5.919 8.462.922 1.317 7.695 11.003h-3.433l-6.943-9.894Z';

/** Instagram glyph, simple-icons 16.36.0 (CC0). Meta allows the glyph in any solid color. */
const INSTAGRAM_PATH =
  'M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077';

const LINK_PATH =
  'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71';
const CHECK_PATH = 'M20 6 9 17l-5-5';

interface Props {
  tool: ShareToolId;
  siteUrl: string;
}

export default function ShareSheet({ tool, siteUrl }: Props) {
  const id = useId();
  const groupName = `${id}-style`;
  const labelId = `${id}-label`;
  const [style, setStyle] = useState<ShareStyle>('scene');
  const [status, setStatus] = useState('');
  const [copied, setCopied] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  // The selected card's image, fetched ahead of the tap, so the share sheet opens straight from the tap.
  const files = useRef(new Map<ShareStyle, File | null>());

  const nav: Navigator | undefined = typeof navigator === 'undefined' ? undefined : navigator;
  const nativeShare = canNativeShare(nav);
  const fileShare = canShareFiles(nav);
  const styleIdx = SHARE_STYLES.indexOf(style);
  const count = SHARE_STYLES.length;
  const shareUrl = buildShareUrl(tool, siteUrl);
  const shareText = buildShareText(tool);
  const name = toolName(tool);

  useEffect(() => {
    if (!fileShare || files.current.has(style)) return;
    let live = true;
    void loadCardFile(fetch, shareImagePath(tool, style), shareFileName(tool, style)).then((file) => {
      if (live) files.current.set(style, file);
    });
    return () => {
      live = false;
    };
  }, [fileShare, tool, style]);

  function select(idx: number) {
    const next = SHARE_STYLES[idx];
    if (!next) return;
    setStyle(next);
    const row = rowRef.current;
    const card = row?.children[idx] as HTMLElement | undefined;
    if (row && card) {
      row.scrollTo({
        left: centeredScrollLeft(row, card),
        behavior: scrollBehavior(typeof matchMedia === 'function' ? matchMedia : undefined),
      });
    }
  }

  async function selectedFile(): Promise<File | null> {
    if (files.current.has(style)) return files.current.get(style) ?? null;
    const file = await loadCardFile(fetch, shareImagePath(tool, style), shareFileName(tool, style));
    files.current.set(style, file);
    return file;
  }

  function report(outcome: ShareOutcome) {
    if (outcome === 'failed' || outcome === 'unavailable') {
      setStatus('sharing did not open. copy the link instead.');
    } else {
      setStatus('');
    }
  }

  async function handleShare() {
    if (!nav) return;
    setStatus('');
    const file = fileShare ? await selectedFile() : null;
    report(await runShare(nav, buildShareData(nav, { title: 'cueory', text: shareText, url: shareUrl }, file)));
  }

  /** Instagram has no web share link: hand the card image to the system share sheet, where Instagram is listed. */
  async function handleImageShare() {
    if (!nav) return;
    setStatus('');
    const file = await selectedFile();
    if (!file || !nav.canShare?.({ files: [file] })) {
      report('unavailable');
      return;
    }
    report(await runShare(nav, { files: [file] }));
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setStatus('link copied.');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setStatus(`copy this link: ${shareUrl}`);
    }
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <p id={labelId} className="text-center text-base text-ink">
        pick a card for {name}
      </p>

      {/* card style picker: one native radio group, so arrow keys move the selection */}
      <div
        ref={rowRef}
        role="radiogroup"
        aria-labelledby={labelId}
        className="relative flex w-full snap-x snap-mandatory gap-4 overflow-x-auto px-4 py-2"
      >
        {SHARE_STYLES.map((s, i) => (
          <CardOption
            key={s}
            id={`${id}-${s}`}
            name={groupName}
            style={s}
            tool={tool}
            checked={style === s}
            onChange={() => select(i)}
          />
        ))}
      </div>

      {/* previous and next beside the position dots, never over the cards. They wrap around, like the radios' own
          arrow keys, so a button never vanishes under keyboard focus. The dots are decoration: the radios carry the state. */}
      <div className="flex items-center gap-4">
        <ArrowButton direction="prev" label="previous style" onClick={() => select((styleIdx + count - 1) % count)} />
        <div aria-hidden="true" className="flex gap-2">
          {SHARE_STYLES.map((s, i) => (
            <span
              key={s}
              className={`h-1.5 rounded-full motion-safe:transition-all ${i === styleIdx ? 'w-4 bg-ink' : 'w-1.5 bg-line'}`}
            />
          ))}
        </div>
        <ArrowButton direction="next" label="next style" onClick={() => select((styleIdx + 1) % count)} />
      </div>

      {/* share actions: outline glyphs in Espresso rings, each with its word under it */}
      <div className="flex flex-wrap justify-center gap-4">
        {nativeShare && (
          <button type="button" className={ACTION} onClick={handleShare}>
            <Ring>
              <ShareIcon />
            </Ring>
            share…
          </button>
        )}
        {fileShare && (
          <button type="button" className={ACTION} onClick={handleImageShare}>
            <Ring>
              <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6 fill-ink">
                <path d={INSTAGRAM_PATH} />
              </svg>
            </Ring>
            Instagram
          </button>
        )}
        <a
          href={xIntentUrl(shareText, shareUrl)}
          target="_blank"
          rel="noopener noreferrer"
          className={`${ACTION} no-underline`}
          aria-label="post on X (opens in a new tab)"
        >
          <Ring>
            <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 fill-ink">
              <path d={X_PATH} />
            </svg>
          </Ring>
          post on X
        </a>
        <button type="button" className={ACTION} onClick={handleCopy}>
          <Ring>
            <Outline path={copied ? CHECK_PATH : LINK_PATH} />
          </Ring>
          {copied ? 'copied' : 'copy link'}
        </button>
      </div>

      <p role="status" className="min-h-6 text-center text-sm text-ink-soft break-all">
        {status}
      </p>
    </div>
  );
}

/** A share action: the ring on top, the word under it. The whole thing is the tap target (well over 44px). */
const ACTION =
  'flex min-h-(--tap-min) min-w-(--tap-min) flex-col items-center gap-1.5 rounded-lg px-1 py-1 text-sm text-ink';

function Ring({ children }: { children: ReactNode }) {
  return (
    <span className="flex size-(--size-share-icon) items-center justify-center rounded-full border-(length:--border-share-icon) border-ink">
      {children}
    </span>
  );
}

function Outline({ path }: { path: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-6 text-ink"
    >
      <path d={path} />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-6 text-ink"
    >
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

interface CardOptionProps {
  id: string;
  name: string;
  style: ShareStyle;
  tool: ShareToolId;
  checked: boolean;
  onChange: () => void;
}

/**
 * One card style. The real radio covers the whole card and draws nothing itself except the shared keyboard focus ring
 * (global :focus-visible), so the focused element shows its own outline (the Task 74 sweep checks exactly that). The
 * chosen card gets a thicker ring and a check mark, so the choice never depends on color.
 */
function CardOption({ id, name, style, tool, checked, onChange }: CardOptionProps) {
  return (
    <label htmlFor={id} className="flex shrink-0 snap-center cursor-pointer flex-col items-center gap-2">
      <span
        className={`relative block w-share-card aspect-share-card overflow-hidden rounded-2xl ${
          checked ? 'ring-2 ring-ink ring-offset-2 ring-offset-page' : 'ring-1 ring-line'
        }`}
      >
        <img
          src={shareImagePath(tool, style)}
          alt=""
          width={1200}
          height={630}
          className="block size-full object-cover"
          decoding="async"
          draggable={false}
        />
        {checked && (
          <span className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-page text-ink">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="size-4"
            >
              <path d={CHECK_PATH} />
            </svg>
          </span>
        )}
        <input
          id={id}
          type="radio"
          name={name}
          value={style}
          checked={checked}
          onChange={onChange}
          className="absolute inset-0 size-full cursor-pointer appearance-none rounded-2xl bg-transparent"
        />
      </span>
      <span className="text-sm text-ink">
        {STYLE_LABELS[style]}
        {checked && (
          <span aria-hidden="true" className="text-ink-soft">
            {' '}
            · chosen
          </span>
        )}
      </span>
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
      className="flex size-(--tap-min) items-center justify-center rounded-full border border-control bg-page text-ink"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="size-5"
      >
        {isPrev ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
      </svg>
    </button>
  );
}
