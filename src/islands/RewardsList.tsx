import type { RewardsPreview } from './rewardslist';

/** Static presentation only. Astro renders this without a client hydration directive. */
export default function RewardsList({ preview }: { preview: RewardsPreview }) {
  return (
    <div className="mt-8 space-y-10 font-body leading-relaxed" data-testid="rewards-list">
      <section aria-labelledby="reward-totals-heading">
        <h2 id="reward-totals-heading" className="text-xl font-medium text-ink">reward totals</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2" data-testid="rewards-summary">
          {preview.summary.map((row) => (
            <div key={row.id} className="rounded-lg border border-line bg-page p-5" data-testid="rewards-summary-row">
              <dt className="text-sm font-medium text-ink-soft">{row.label}</dt>
              <dd className="mt-2 text-ink">{row.text}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="reward-samples-heading">
        <h2 id="reward-samples-heading" className="text-xl font-medium text-ink">sample events</h2>
        {preview.events.length === 0 ? (
          <p className="mt-3 text-ink-soft" data-testid="rewards-empty">no sample events yet.</p>
        ) : (
          <ol className="mt-4 space-y-3" aria-label="sample reward events">
            {preview.events.map((row) => (
              <li key={row.id} className="rounded-lg border border-line bg-page p-5" data-testid="rewards-event">
                <p className="font-medium text-ink">{row.label}</p>
                <p className="mt-2 text-ink-soft">{row.text}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="reward-achievements-heading">
        <h2 id="reward-achievements-heading" className="text-xl font-medium text-ink">earned achievements</h2>
        {preview.achievements.length === 0 ? (
          <p className="mt-3 text-ink-soft" data-testid="rewards-no-achievements">none earned in these samples.</p>
        ) : (
          <ul className="mt-4 space-y-2" aria-label="sample achievements">
            {preview.achievements.map((achievement) => (
              <li key={achievement.id} className="rounded-lg border border-line bg-page p-4 text-ink" data-testid="rewards-achievement">
                {achievement.name}, earned on {achievement.day}.
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
