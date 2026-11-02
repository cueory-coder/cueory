import { useEffect, useState } from 'react';
import {
  clearResume, readResume, resumeName, resumePosition, type ResumeSnapshot,
} from '../scripts/resume';
import { browserStorage } from '../scripts/storage';

export interface ResumePromptProps {
  /** The study page's own path. The resume record is never a redirect URL. */
  page: string;
  /** The owning study island restores the answers, exact item and timer. */
  onContinue: (snapshot: ResumeSnapshot) => void;
  /** The owning study island clears its active state and starts a fresh round. */
  onStartOver: () => void;
}

/**
 * A resume choice for the owning React study island.
 *
 * This component never alters the question bank or answers. It stays hidden
 * when there is no valid matching snapshot. In-progress sharpening is never
 * returned by readResume, but completed results may be restored.
 */
export default function ResumePrompt({ page, onContinue, onStartOver }: ResumePromptProps) {
  const [snapshot, setSnapshot] = useState<ResumeSnapshot | null>(null);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    const found = readResume(browserStorage());
    setSnapshot(found && found.page.split('#', 1)[0] === page.split('#', 1)[0] ? found : null);
  }, [page]);

  if (!snapshot) return null;
  return (
    <ResumeChoices
      snapshot={snapshot}
      problem={problem}
      onContinue={() => {
        onContinue(snapshot);
        setSnapshot(null);
      }}
      onStartOver={() => {
        if (!clearResume(browserStorage())) {
          setProblem('this browser could not clear the saved place. please try again.');
          return;
        }
        setProblem('');
        setSnapshot(null);
        onStartOver();
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
  const name = resumeName(snapshot);
  const position = resumePosition(snapshot);
  return (
    <section aria-labelledby="cueory-resume-heading" className="rounded-lg border border-line bg-surface p-5 text-ink">
      <h2 id="cueory-resume-heading" className="text-lg">pick up where you left off?</h2>
      <p className="mt-2 text-sm text-ink-soft">{name} · {position}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          className="min-h-11 rounded-pill bg-button px-5 py-2.5 text-on-button hover:bg-button-hover"
          onClick={onContinue}
        >
          {snapshot.phase === 'results' ? 'continue with results' : 'continue question ' + (snapshot.itemIndex + 1)}
        </button>
        <button
          type="button"
          className="min-h-11 rounded-pill border border-control px-5 py-2.5 text-ink"
          onClick={onStartOver}
        >
          start over
        </button>
      </div>
      {problem && <p role="alert" className="mt-3 text-sm text-ink">{problem}</p>}
    </section>
  );
}
