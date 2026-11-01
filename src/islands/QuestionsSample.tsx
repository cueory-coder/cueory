import { useEffect, useState } from 'react';
import QuestionsPlayer from './QuestionsPlayer';
import { sampleChecker, type Checker, type Question, type SampleItem } from './questions';

/** Only our own site's JSON files, so a page can't point the player at another site. */
const isOwnPath = (src: string) => /^\/(?!\/)[\w\-./]+\.json$/.test(src);

interface Loaded {
  src: string;
  questions: Question[];
  check: Checker;
}

/**
 * Sample questions for a study page (D-33). The page passes only the address of a sample file; it's fetched after the
 * page loads, and the player gets the public questions (stems and choices) and the sample checker. The checker refuses
 * anything not marked "sample", so this can never carry real questions. Real ones come with Task 2's check_answer.
 * Wire with client:only="react".
 */
export default function QuestionsSample({ src }: { src: string }) {
  const [loaded, setLoaded] = useState<Loaded | 'failed' | undefined>(undefined);

  useEffect(() => {
    if (!isOwnPath(src)) {
      setLoaded('failed');
      return;
    }
    let cancelled = false;
    setLoaded(undefined);
    fetch(src, { credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((data: { status?: unknown; items?: unknown }) => {
        if (data.status !== 'sample' || !Array.isArray(data.items)) throw new Error('not a sample file');
        const items = data.items as SampleItem[];
        const check = sampleChecker(items);
        const questions = items.map(({ id, type, stem, choices }) => ({ id, type, stem, choices }));
        if (!cancelled) setLoaded({ src, questions, check });
      })
      .catch(() => {
        if (!cancelled) setLoaded('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (loaded === 'failed') return <p role="alert">these questions could not be loaded. please try again later.</p>;
  if (!loaded || loaded.src !== src) return <p className="text-sm text-ink-soft">loading the questions…</p>;
  return <QuestionsPlayer questions={loaded.questions} check={loaded.check} />;
}
