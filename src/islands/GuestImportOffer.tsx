import { useEffect, useRef, useState } from 'react';
import type { IdMap } from './guestimport';
import {
  acceptOffer, cardsDbFrom, contentsWords, declineOffer, isMarkerEvent, offerDecision, plansDbFrom, sessionUserId,
  type ImportClient, type LockRunner, type OfferContents,
} from './guestimportoffer';
import { getSessionState, getSupabase } from './supabaseclient';
import { localDay } from '../scripts/progress';
import { browserStorage } from '../scripts/storage';

/**
 * No card is matched to a published question yet, so only the exam date can come in today. A later task passes the
 * deck-to-item map here; until then card piles stay on this device and do not trigger the offer.
 */
const NO_CARD_MATCHES: IdMap = new Map();

type View =
  | { kind: 'hidden' }
  | { kind: 'offer' | 'working'; contents: OfferContents; message?: string }
  | { kind: 'done'; contents: OfferContents };

const primaryButton = 'min-h-11 rounded-pill bg-button px-5 py-2.5 text-on-button hover:bg-button-hover';
const secondaryButton = 'min-h-11 rounded-pill border border-control px-5 py-2.5 text-ink';

function browserLock(): LockRunner | undefined {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks) return undefined;
  return (name, task) => locks.request(name, task);
}

const isPlural = ({ cards, examPlan }: OfferContents) => cards > 1 || (cards > 0 && examPlan);

/** The part of the shared client this island listens to for sign-in and sign-out, in this tab or another. */
interface AuthEvents {
  auth: {
    onAuthStateChange(
      callback: (event: string, session: { user?: { id?: unknown } | null } | null) => void,
    ): { data: { subscription: { unsubscribe(): void } } };
  };
}

/** Who the shared client is signed in as right now, read fresh from its session. */
async function signedInNow(): Promise<string | null> {
  const session = await getSessionState();
  return session.signedIn ? session.userId : null;
}

/**
 * The one-time offer to bring this device's guest progress into the account just signed in to (Task 143).
 * Accounts off, signed out, or nothing to bring in: renders nothing and touches no storage.
 */
export default function GuestImportOffer({ idMap = NO_CARD_MATCHES }: { idMap?: IdMap }) {
  const [view, setView] = useState<View>({ kind: 'hidden' });
  const account = useRef<{ client: ImportClient; userId: string } | null>(null);
  const doneRef = useRef<HTMLParagraphElement>(null);
  /** Bumped whenever the signed-in account changes, so a decision or import begun for the old one is dropped. */
  const generation = useRef(0);

  useEffect(() => {
    let active = true;
    let subscription: { unsubscribe(): void } | null = null;
    const decide = async () => {
      const started = generation.current;
      try {
        const client = await getSupabase();
        if (!client || !active) return;
        const session = await getSessionState();
        if (!active || started !== generation.current || !session.signedIn) return;
        account.current = { client: client as unknown as ImportClient, userId: session.userId };
        const decision = offerDecision(session, browserStorage(), idMap, localDay(new Date()));
        setView((current) => {
          if (current.kind === 'working' || current.kind === 'done') return current;
          return decision.show ? { kind: 'offer', contents: decision.contents } : { kind: 'hidden' };
        });
      } catch {
        // An unavailable network or blocked storage leaves the page as it was.
      }
    };
    // Signed out, or signed in as someone else (here or in another tab): the offer shown was for the old account,
    // so it goes away, and the new account gets its own decision.
    const onAuth = (_event: string, session: { user?: { id?: unknown } | null } | null) => {
      if (!active) return;
      const now = sessionUserId(session);
      const shown = account.current?.userId ?? null;
      if (now === shown) return;
      if (shown === null && now === null) return;
      generation.current += 1;
      account.current = null;
      setView({ kind: 'hidden' });
      if (now) void decide();
    };
    const listen = async () => {
      try {
        const client = (await getSupabase()) as unknown as AuthEvents | null;
        if (!client || !active) return;
        subscription = client.auth.onAuthStateChange(onAuth).data.subscription;
      } catch {
        // No client: there is no offer to keep in step either.
      }
    };
    void decide();
    void listen();
    // Another tab brought it in or said "not now": stop offering here too.
    const onStorage = (event: StorageEvent) => {
      const userId = account.current?.userId;
      if (userId && isMarkerEvent(event.key, userId)) void decide();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      active = false;
      subscription?.unsubscribe();
      window.removeEventListener('storage', onStorage);
    };
  }, [idMap]);

  useEffect(() => {
    if (view.kind === 'done') doneRef.current?.focus();
  }, [view.kind]);

  if (view.kind === 'hidden') return null;

  if (view.kind === 'done') {
    return (
      <section aria-label="progress from this device" className="mb-8 rounded-lg border border-line bg-surface p-5 text-ink">
        <p ref={doneRef} tabIndex={-1} role="status">
          {contentsWords(view.contents)} {isPlural(view.contents) ? 'are' : 'is'} in your account now.
        </p>
      </section>
    );
  }

  const bringIn = async () => {
    const current = account.current;
    if (!current || view.kind !== 'offer') return;
    const { contents } = view;
    const started = generation.current;
    setView({ kind: 'working', contents });
    const outcome = await acceptOffer({
      storage: browserStorage(),
      userId: current.userId,
      idMap,
      today: localDay(new Date()),
      cardsDb: cardsDbFrom(current.client),
      plansDb: plansDbFrom(current.client, current.userId),
      lock: browserLock(),
      currentUserId: signedInNow,
    });
    // The account changed while this ran: whatever is on screen now belongs to the new account.
    if (started !== generation.current) return;
    if (outcome.kind === 'account-changed') {
      generation.current += 1;
      account.current = null;
      setView({ kind: 'hidden' });
    } else if (outcome.kind === 'done') setView({ kind: 'done', contents: outcome.contents });
    else if (outcome.kind === 'handled') setView({ kind: 'hidden' });
    else setView({ kind: 'offer', contents, message: outcome.message });
  };

  const notNow = () => {
    const current = account.current;
    if (!current || view.kind !== 'offer') return;
    if (!declineOffer(browserStorage(), current.userId)) {
      setView({ ...view, message: "this browser couldn't save that. please try again." });
      return;
    }
    setView({ kind: 'hidden' });
    // The offer is gone, so keyboard focus moves to the page heading instead of being lost.
    const heading = document.querySelector<HTMLElement>('main h1');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus();
    }
  };

  const working = view.kind === 'working';
  return (
    <section aria-labelledby="cueory-guest-import-heading" className="mb-8 rounded-lg border border-line bg-surface p-5 text-ink" data-testid="guest-import-offer">
      <h2 id="cueory-guest-import-heading" className="text-lg">bring in your progress from this device?</h2>
      <p className="mt-2 text-sm text-ink-soft">on this device: {contentsWords(view.contents)}.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" className={primaryButton} aria-disabled={working} onClick={() => { void bringIn(); }}>
          {working ? 'bringing it in…' : 'bring it in'}
        </button>
        <button type="button" className={secondaryButton} aria-disabled={working} onClick={notNow}>not now</button>
      </div>
      <p className="mt-3 text-sm" role="alert">{view.message ?? ''}</p>
    </section>
  );
}
