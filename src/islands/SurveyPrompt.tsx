import { useEffect, useId, useState, type FormEvent } from 'react';
import { browserStorage, type KeyValueStorage } from '../scripts/storage';

export interface SurveySubmission {
  usedForFinal: boolean | null;
  feedback: string;
}

export interface SurveyPromptProps {
  /** If true (e.g. while a question or card is active), survey prompt will never render. */
  activeQuestion?: boolean;
  /** Storage key used to persist dismissal. */
  storageKey?: string;
  /** Optional storage stand-in for testing or environments with blocked storage. */
  storage?: KeyValueStorage;
  /** Submission callback for when student submits the survey. */
  onSubmit?: (submission: SurveySubmission) => void | Promise<void>;
  /** Optional callback when dismissed. */
  onDismiss?: () => void;
}

const STORAGE_KEY_DEFAULT = 'cueory-finals-survey-dismissed';
const MAX_FEEDBACK_CHARS = 200;

const primaryButton =
  'min-h-11 rounded-pill bg-button px-5 py-2.5 text-on-button hover:bg-button-hover disabled:opacity-50';
const secondaryButton =
  'min-h-11 rounded-pill border border-control px-5 py-2.5 text-ink hover:bg-surface disabled:opacity-50';

function isDismissed(key: string, storage?: KeyValueStorage): boolean {
  try {
    const store = storage ?? browserStorage();
    return store?.getItem(key) === 'true';
  } catch {
    return false;
  }
}

function saveDismissed(key: string, storage?: KeyValueStorage): void {
  try {
    const store = storage ?? browserStorage();
    store?.setItem(key, 'true');
  } catch {
    // blocked storage
  }
}

export default function SurveyPrompt({
  activeQuestion = false,
  storageKey = STORAGE_KEY_DEFAULT,
  storage,
  onSubmit,
  onDismiss,
}: SurveyPromptProps) {
  // Mount state tracking to avoid SSR hydration mismatches when reading from storage
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [usedForFinal, setUsedForFinal] = useState<boolean | null>(null);
  const [feedback, setFeedback] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const id = useId();

  useEffect(() => {
    setMounted(true);
    setDismissed(isDismissed(storageKey, storage));
  }, [storageKey, storage]);

  // Never opens while a question or card is active, or if already dismissed or before hydration
  if (!mounted || activeQuestion || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    saveDismissed(storageKey, storage);
    setDismissed(true);
    onDismiss?.();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const cleanFeedback = feedback.trim().slice(0, MAX_FEEDBACK_CHARS);
    const data: SurveySubmission = {
      usedForFinal,
      feedback: cleanFeedback,
    };
    saveDismissed(storageKey, storage);
    setSubmitted(true);
    await onSubmit?.(data);
  };

  if (submitted) {
    return (
      <section
        role="status"
        aria-label="survey confirmation"
        className="rounded-lg border border-line bg-surface p-5 text-ink"
      >
        <p className="text-sm font-medium">thank you for your feedback.</p>
      </section>
    );
  }

  return (
    <section
      role="region"
      aria-labelledby={`${id}-title`}
      className="rounded-lg border border-line bg-surface p-5 text-ink shadow-sm"
      data-testid="finals-survey-prompt"
    >
      <div className="flex items-start justify-between gap-4">
        <h2 id={`${id}-title`} className="text-base font-semibold">
          quick semester survey
        </h2>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="dismiss survey"
          className="min-h-11 px-2 text-xs leading-relaxed text-ink-soft hover:text-ink"
        >
          dismiss
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <fieldset>
          <legend className="text-sm font-medium text-ink">
            did you use Cueory for a final or exit exam this semester?
          </legend>
          <div className="mt-2 flex gap-4 text-sm">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={`${id}-used`}
                checked={usedForFinal === true}
                onChange={() => setUsedForFinal(true)}
                className="accent-button"
              />
              <span>yes</span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={`${id}-used`}
                checked={usedForFinal === false}
                onChange={() => setUsedForFinal(false)}
                className="accent-button"
              />
              <span>no</span>
            </label>
          </div>
        </fieldset>

        <div>
          <div className="flex justify-between items-baseline">
            <label htmlFor={`${id}-feedback`} className="text-sm font-medium text-ink">
              what would make it more useful?
            </label>
            <span className="text-xs leading-relaxed text-ink-soft">
              {feedback.length}/{MAX_FEEDBACK_CHARS}
            </span>
          </div>
          <textarea
            id={`${id}-feedback`}
            value={feedback}
            maxLength={MAX_FEEDBACK_CHARS}
            onChange={(e) => setFeedback(e.currentTarget.value.slice(0, MAX_FEEDBACK_CHARS))}
            rows={3}
            className="mt-1 w-full rounded-md border border-control bg-page p-2.5 text-sm text-ink placeholder:text-ink-soft"
            placeholder="share your thoughts (optional)..."
          />
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          <button type="submit" className={primaryButton}>
            send feedback
          </button>
          <button type="button" onClick={handleDismiss} className={secondaryButton}>
            not now
          </button>
        </div>
      </form>
    </section>
  );
}
