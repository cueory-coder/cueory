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
  'min-h-11 w-full min-w-0 max-w-full rounded-pill bg-button px-2 py-2.5 text-on-button whitespace-normal break-words hover:bg-button-hover disabled:opacity-50 sm:w-auto sm:px-5';
const secondaryButton =
  'min-h-11 w-full min-w-0 max-w-full rounded-pill border border-control px-2 py-2.5 text-ink whitespace-normal break-words hover:bg-surface disabled:opacity-50 sm:w-auto sm:px-5';

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

/** Only a completed callback can justify claiming that feedback was sent. */
export async function deliverSurveyFeedback(
  send: SurveyPromptProps['onSubmit'],
  submission: SurveySubmission,
): Promise<'sent' | 'unavailable' | 'failed'> {
  if (!send) return 'unavailable';
  try {
    await send(submission);
    return 'sent';
  } catch {
    return 'failed';
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
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
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
    if (submitting) return;
    const cleanFeedback = feedback.trim().slice(0, MAX_FEEDBACK_CHARS);
    const data: SurveySubmission = { usedForFinal, feedback: cleanFeedback };
    setSubmitting(true);
    setSubmitError(null);
    const outcome = await deliverSurveyFeedback(onSubmit, data);
    if (outcome === 'sent') {
      saveDismissed(storageKey, storage);
      setSubmitted(true);
    } else {
      setSubmitError(outcome === 'unavailable'
        ? 'feedback sending is not available in this preview.'
        : 'could not send feedback. please try again.');
    }
    setSubmitting(false);
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
      className="min-w-0 rounded-lg border border-line bg-surface p-3 text-ink shadow-sm sm:p-5"
      data-testid="finals-survey-prompt"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <h2 id={`${id}-title`} className="min-w-0 break-words text-base font-semibold">
          quick semester survey
        </h2>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="dismiss survey"
          className="min-h-11 max-w-full px-2 text-xs leading-relaxed text-ink-soft hover:text-ink"
        >
          dismiss
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 min-w-0 space-y-4">
        <fieldset>
          <legend className="text-sm font-medium text-ink">
            did you use Cueory for a final or exit exam this semester?
          </legend>
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
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
          <div className="flex flex-wrap items-baseline justify-between gap-2">
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
            className="mt-1 w-full min-w-0 rounded-md border border-control bg-page p-2.5 text-sm text-ink placeholder:text-ink-soft"
            placeholder="share your thoughts (optional)..."
          />
        </div>

        {!onSubmit && (
          <p className="text-sm leading-relaxed text-ink-soft">
            preview only — feedback is not being collected yet.
          </p>
        )}
        {submitError && <p role="alert" className="text-sm leading-relaxed text-ink">{submitError}</p>}
        <div className="flex flex-wrap gap-3 pt-2">
          <button type="submit" className={primaryButton} disabled={!onSubmit || submitting}>
            {submitting ? 'sending…' : 'send feedback'}
          </button>
          <button type="button" onClick={handleDismiss} className={secondaryButton}>
            not now
          </button>
        </div>
      </form>
    </section>
  );
}
