import { useEffect, useRef, useState } from 'react';
import { site } from '../config/site';
import NextPuzzleCountdown from './NextPuzzleCountdown';
import ResultSignup from './ResultSignup';
import {
  buildResultShareLine,
  discardPendingResultCard,
  GAME_RESULT_CARD_EVENT,
  inertOutside,
  lockPageScroll,
  takePendingResultCards,
  type GameResultCard,
} from './gameresults';
import { canShareFiles, createStoryFile, platformShareUrl, shareFileOrCopy, type SharePlatform } from './share';

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
  const [prepared, setPrepared] = useState<{ card: GameResultCard; file: File } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const activeCard = useRef<GameResultCard | null>(null);
  const preparation = useRef(0);
  const closeButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<GameResultCard>).detail;
      if (!detail) return;
      discardPendingResultCard(detail);
      // Replacing an open result keeps the page control that originally opened the dialog.
      if (!activeCard.current) {
        returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      }
      activeCard.current = detail;
      preparation.current++;
      setPrepared(null);
      setPreparing(false);
      setStatus('');
      setCard(detail);
    };
    window.addEventListener(GAME_RESULT_CARD_EVENT, open);
    for (const pending of takePendingResultCards()) open(new CustomEvent<GameResultCard>(GAME_RESULT_CARD_EVENT, { detail: pending }));
    return () => {
      activeCard.current = null;
      preparation.current++;
      window.removeEventListener(GAME_RESULT_CARD_EVENT, open);
    };
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
      const focusable = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"])') ?? [])];
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
    activeCard.current = null;
    const request = ++preparation.current;
    const target = returnFocus.current;
    setPrepared(null);
    setPreparing(false);
    setCard(null);
    requestAnimationFrame(() => {
      if (request === preparation.current && !activeCard.current) target?.focus();
    });
  }

  async function copy(text: string, request = preparation.current) {
    if (!activeCard.current || request !== preparation.current) return false;
    try {
      await navigator.clipboard.writeText(text);
      if (request !== preparation.current) return false;
      setStatus('result copied.');
      return true;
    } catch {
      if (request === preparation.current) setStatus(`copy this result: ${text}`);
      return false;
    }
  }

  async function share(card: GameResultCard, line: string) {
    if (activeCard.current !== card) return;
    // Browsers without image-file sharing copy immediately; no canvas, font or logo work delays that fallback.
    if (!canShareFiles(navigator)) {
      await copy(line);
      return;
    }
    if (prepared?.card === card) {
      const request = preparation.current;
      // No image-generation await precedes this call: the new click supplies fresh user activation.
      await shareFileOrCopy(
        navigator,
        { title: `${card.name} result · cueory`, text: line, url: absoluteUrl(card.path) },
        prepared.file,
        (text) => copy(text, request),
      );
      return;
    }
    if (preparing) return;
    const request = ++preparation.current;
    setPreparing(true);
    setStatus('preparing image.');
    const file = await createStoryFile({
      name: card.name,
      date: card.date,
      // The image carries the same detailed outcome as the share line (for example the hello cards prompt).
      result: card.shareResult ?? card.result,
      ...(card.wordmarkPath ? { wordmarkPath: card.wordmarkPath } : {}),
    });
    if (request !== preparation.current || activeCard.current !== card) return;
    setPreparing(false);
    if (!file) { await copy(line); return; }
    setPrepared({ card, file });
    setStatus('image ready. tap share image to open your share options.');
  }

  // While the dialog is open, the page behind it is inert and cannot scroll.
  const open = card !== null;
  useEffect(() => {
    if (!open || !dialog.current) return;
    const restoreInert = inertOutside(dialog.current, document.body);
    const restoreScroll = lockPageScroll(document.documentElement, document.body, window);
    return () => {
      restoreScroll();
      restoreInert();
    };
  }, [open]);

  if (!card) return null;
  const line = buildResultShareLine(card);
  const url = absoluteUrl(card.path);

  return (
    <div
      className="result-dialog-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}
      data-testid="game-result-overlay"
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-result-title"
        aria-describedby="game-result-summary"
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-xl border border-line bg-page p-6 text-ink shadow-card sm:p-8"
        data-testid="game-result-dialog"
        data-result-dialog
      >
        <div className="flex items-start justify-between gap-4">
          <p className="result-meta text-sm font-bold text-ink-soft">
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
          <button type="button" aria-disabled={preparing || undefined} aria-busy={preparing || undefined} className="min-h-(--tap-min) rounded-pill bg-button px-5 py-2.5 text-on-button aria-disabled:opacity-50" onClick={() => void share(card, line)}>{prepared?.card === card ? 'share image' : preparing ? 'preparing image' : 'share'}</button>
          <button type="button" className="min-h-(--tap-min) rounded-pill border border-control px-5 py-2.5" onClick={() => void copy(line)}>copy</button>

          <nav aria-label="share result on a website" className="flex flex-wrap gap-2">
            {platforms.map((platform) => (
              <a key={platform.id} href={platformShareUrl(platform.id, line, url)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-(--tap-min) min-w-(--tap-min) items-center justify-center rounded-pill border border-control bg-page px-4 py-2">
                {platform.label}<span className="sr-only"> (opens in a new tab)</span>
              </a>
            ))}
          </nav>
        </div>

        <p role="status" className="mt-3 min-h-6 text-sm text-ink-soft break-all">{status}</p>
        {card.nextMessage ? (
          <p className="mt-4 text-sm text-ink-soft">{card.nextMessage}</p>
        ) : (
          <NextPuzzleCountdown key={`${card.game}:${card.date}`} />
        )}
        {site.tipPageUrl && (
          <a href={site.tipPageUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-(--tap-min) items-center text-sm text-ink-soft underline underline-offset-4">
            support our mission<span className="sr-only"> (opens in a new tab)</span>
          </a>
        )}
        <ResultSignup />
      </div>
    </div>
  );
}
