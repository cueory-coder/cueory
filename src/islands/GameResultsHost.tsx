import { useEffect, useRef, useState } from 'react';
import { buildResultShareLine, GAME_RESULT_CARD_EVENT, type GameResultCard } from './gameresults';
import { buildShareData, createStoryFile, platformShareUrl, runShare, type SharePlatform } from './share';

const platforms: readonly { id: SharePlatform; label: string }[] = [
  { id: 'facebook', label: 'facebook' },
  { id: 'x', label: 'x' },
  { id: 'threads', label: 'threads' },
  { id: 'reddit', label: 'reddit' },
  { id: 'whatsapp', label: 'whatsapp' },
];

function absoluteUrl(path: string): string {
  return new URL(path, window.location.origin).href;
}

/** One shared, accessible dialog for every finished game. */
export default function GameResultsHost() {
  const [card, setCard] = useState<GameResultCard | null>(null);
  const [status, setStatus] = useState('');
  const closeButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<GameResultCard>).detail;
      if (!detail) return;
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setStatus('');
      setCard(detail);
    };
    window.addEventListener(GAME_RESULT_CARD_EVENT, open);
    return () => window.removeEventListener(GAME_RESULT_CARD_EVENT, open);
  }, []);

  useEffect(() => {
    if (!card) return;
    closeButton.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]') ?? [])];
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [card]);

  function close() {
    setCard(null);
    requestAnimationFrame(() => returnFocus.current?.focus());
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus('result copied.');
      return true;
    } catch {
      setStatus(`copy this result: ${text}`);
      return false;
    }
  }

  async function share(card: GameResultCard, line: string) {
    const file = await createStoryFile({
      name: card.name,
      date: card.date,
      result: card.result,
      ...(card.wordmarkPath ? { wordmarkPath: card.wordmarkPath } : {}),
    });
    if (!file || !navigator.canShare?.({ files: [file] })) {
      await copy(line);
      return;
    }
    const data = buildShareData(
      navigator,
      { title: `${card.name} result · cueory`, text: line, url: absoluteUrl(card.path) },
      file,
    );
    const outcome = await runShare(navigator, data);
    if (outcome === 'shared' || outcome === 'cancelled') return;
    await copy(line);
  }

  if (!card) return null;
  const line = buildResultShareLine(card);
  const url = absoluteUrl(card.path);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
      onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}
      data-testid="game-result-overlay"
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-result-title"
        aria-describedby="game-result-summary"
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-page p-6 text-ink shadow-card sm:p-8"
        data-testid="game-result-dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm font-bold uppercase tracking-label text-ink-soft">
            {card.name}{card.level ? ` · ${card.level}` : ''} · {card.date}
          </p>
          <button
            ref={closeButton}
            type="button"
            aria-label="close results"
            onClick={close}
            className="flex size-(--tap-min) shrink-0 items-center justify-center rounded-full border border-control bg-page text-ink"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <h2 id="game-result-title" className="display mt-3 text-title sm:text-title-lg" aria-live="polite">
          {card.result}
        </h2>
        <p id="game-result-summary" className="mt-2 text-ink-soft">{card.summary}</p>

        <dl className="mt-5 flex flex-wrap gap-2">
          {card.stats.slice(0, 3).map((stat) => (
            <div key={stat.label} className="rounded-pill border border-line px-4 py-2">
              <dt className="text-sm text-ink-soft">{stat.label}</dt>
              <dd className="font-bold">{stat.value}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-5 rounded-md border border-dashed border-control p-3 text-sm break-words" data-testid="result-share-line">
          {line}
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" className="min-h-(--tap-min) rounded-pill bg-button px-5 py-2.5 text-on-button" onClick={() => void share(card, line)}>share</button>
          <button type="button" className="min-h-(--tap-min) rounded-pill border border-control px-5 py-2.5" onClick={() => void copy(line)}>copy</button>
        </div>

        <nav aria-label="share result on a website" className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
          {platforms.map((platform) => (
            <a key={platform.id} href={platformShareUrl(platform.id, line, url)} target="_blank" rel="noopener noreferrer" className="min-h-(--tap-min) inline-flex items-center underline underline-offset-4">
              {platform.label}<span className="sr-only"> (opens in a new tab)</span>
            </a>
          ))}
        </nav>

        <p role="status" className="mt-3 min-h-6 text-sm text-ink-soft break-all">{status}</p>
        <p className="mt-4 text-sm text-ink-soft">a new {card.name} comes out tomorrow.</p>
      </div>
    </div>
  );
}
