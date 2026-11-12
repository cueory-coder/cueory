import { useEffect, useState } from 'react';
import { clearResume, readResume, type ResumeSnapshot } from '../scripts/resume';
import { browserStorage } from '../scripts/storage';
import {
  matchingResumePage, resumeDecision, resumePromptText, shouldRecoverResumeFocus,
} from './resumeprompt';

export interface ResumePromptProps {
  /** The study page's own path. The resume record is never a redirect URL. */
  page: string;
  /** The owning study island restores the answers, exact item and timer. */
  onContinue: (snapshot: ResumeSnapshot) => void;
  /** The owning study island clears its active state and starts a fresh round. */
  onStartOver: () => void;
}

/**
 * If the current button disappears, give focus to a visible control in this study board.
 * The boards that already move focus to a particular item keep that focus unchanged.
 */
function recoverFocusAfterChoice(owner: HTMLElement | null): void {
  const main = document.getElementById('main');
  window.requestAnimationFrame(() => {
    const active = document.activeElement;
    const meaningful = active instanceof HTMLElement && active.isConnected &&
      active !== document.body && active !== document.documentElement;
    if (!shouldRecoverResumeFocus(meaningful)) return;

    for (const root of [owner, main]) {
      if (!root?.isConnected) continue;
      const targets = root.querySelectorAll<HTMLElement>(
        '[tabindex="-1"], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled), a[href]',
      );
      for (const target of Array.from(targets)) {
        if (target.closest('[inert], [aria-hidden="true"]') || target.getClientRects().length === 0 ||
          window.getComputedStyle(target).visibility === 'hidden') continue;
        target.focus({ preventScroll: true });
        if (document.activeElement === target) return;
      }
    }

    // Some boards have no available interactive control after a completed result.
    // The page's main landmark is a safe, non-Tab-stop focus fallback.
    if (main?.isConnected) {
      main.tabIndex = -1;
      main.focus({ preventScroll: true });
    }
  });
}

/**
 * A resume choice for the owning React study island. No change to save format,
 * study answers, or the owning board's onContinue / onStartOver callbacks.
 */
export default function ResumePrompt({ page, onContinue, onStartOver }: ResumePromptProps) {
  const [snapshot, setSnapshot] = useState<ResumeSnapshot | null>(null);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    setSnapshot(matchingResumePage(readResume(browserStorage()), page));
    setProblem('');
  }, [page]);

  if (!snapshot) return null;
  return (
    <ResumeChoices
      snapshot={snapshot}
      problem={problem}
      onContinue={() => {
        const owner = document.getElementById('cueory-resume-heading')?.closest('section')?.parentElement ?? null;
        const choice = resumeDecision('continue');
        if (choice.action !== 'continue') return;
        onContinue(snapshot);
        setSnapshot(null);
        recoverFocusAfterChoice(owner);
      }}
      onStartOver={() => {
        const owner = document.getElementById('cueory-resume-heading')?.closest('section')?.parentElement ?? null;
        const choice = resumeDecision('start-over', clearResume(browserStorage()));
        if (!choice.close) {
          setProblem(choice.error);
          return;
        }
        setProblem('');
        setSnapshot(null);
        onStartOver();
        recoverFocusAfterChoice(owner);
      }}
    />
  );
}

/** Static markup is independently testable without browser storage or network. */
export function ResumeChoices({
  snapshot, problem, onContinue, onStartOver,
}: {
  snapshot: ResumeSnapshot;
  problem: string;
  onContinue: () => void;
  onStartOver: () => void;
}) {
  const copy = resumePromptText(snapshot, Date.now());
  return (
    <section aria-labelledby="cueory-resume-heading" aria-describedby="cueory-resume-summary" className="rounded-lg border border-line bg-surface p-5 text-ink">
      <h2 id="cueory-resume-heading" className="text-lg">{copy.heading}</h2>
      <p id="cueory-resume-summary" className="mt-2 text-sm text-ink-soft">{copy.summary}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          className="min-h-11 rounded-pill bg-button px-5 py-2.5 text-on-button hover:bg-button-hover"
          onClick={onContinue}
        >
          {copy.continueLabel}
        </button>
        <button
          type="button"
          className="min-h-11 rounded-pill border border-control px-5 py-2.5 text-ink"
          onClick={onStartOver}
        >
          {copy.startOverLabel}
        </button>
      </div>
      {problem && <p role="alert" className="mt-3 text-sm text-ink">{problem}</p>}
    </section>
  );
}
