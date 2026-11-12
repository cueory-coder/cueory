import { newsletter } from '../config/site';

/** Reuses SignupForm.astro's plain Kit form contract and settings; no provider script or client-side submission. */
export default function ResultSignup() {
  const ready = newsletter.formAction.startsWith('https://');
  return (
    <section className="mt-5" aria-labelledby="result-signup-heading" data-testid="result-signup">
      <h3 id="result-signup-heading" className="font-bold">get launch updates</h3>
      {ready ? (
        <>
          <form action={newsletter.formAction} method="post" className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" data-testid="result-signup-form">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <label htmlFor="result-signup-email" className="text-sm text-ink-soft">email address</label>
              <input id="result-signup-email" name={newsletter.emailFieldName} type="email" required maxLength={254} autoComplete="email" inputMode="email" aria-describedby="result-signup-email-help" className="min-w-0 rounded-md border border-control bg-page px-4 py-3 text-ink" />
            </div>
            <button type="submit" className="min-h-(--tap-min) rounded-pill bg-button px-6 py-3 text-on-button hover:bg-button-hover">sign up</button>
          </form>
          <p id="result-signup-email-help" className="mt-4 text-sm text-ink-soft">
            a few emails about new lessons and the launch. unsubscribe any time. emails are sent by {newsletter.provider};
            see our <a href="/privacy" className="inline-flex min-h-(--tap-min) items-center underline">privacy page</a>.
          </p>
        </>
      ) : (
        <p className="mt-3 text-ink-soft" data-testid="result-signup-pending">signups open soon.</p>
      )}
    </section>
  );
}
