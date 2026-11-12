import { useEffect, useState } from 'react';
import { clearResume, readResume, type ResumeSnapshot } from '../scripts/resume';
import { browserStorage } from '../scripts/storage';
import {
  matchingResumePage, resumeDecision, resumePromptText, restoreResumeChoiceFocus,
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
        window.requestAnimationFrame(() => restoreResumeChoiceFocus(document, owner));
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
        window.requestAnimationFrame(() => restoreResumeChoiceFocus(document, owner));
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
