import { useId, useRef, useState } from 'react';

interface Props {
  /** The review owner supplies its completed result, never a URL flag or a timer. */
  reviewCompleted?: boolean;
}

const button = 'min-h-12 rounded-pill px-5 py-3';

/** Design only. No delivery adapter, permission request, subscription, storage or account access. */
export default function ReminderOptIn({ reviewCompleted = false }: Props) {
  // Unmounting the choices also clears them when another review begins.
  return reviewCompleted === true ? <ReminderChoices /> : null;
}

function ReminderChoices() {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<'phone' | 'email' | null>(null);
  const close = () => {
    setOpen(false);
    setChannel(null);
    trigger.current?.focus();
  };

  return <div className="font-body leading-relaxed" data-reminder-preview>
    <button ref={trigger} type="button" aria-expanded={open} aria-controls={`${id}-choices`}
      aria-describedby={`${id}-notice`} className={`${button} border border-control bg-page text-ink`}
      onClick={() => { if (open) close(); else setOpen(true); }}>remind me</button>
    <p id={`${id}-notice`} className="mt-3 text-sm text-ink-soft">
      reminder preview only. nothing will be sent, enabled or saved.
    </p>
    <div id={`${id}-choices`} hidden={!open} className="mt-6 rounded-lg border border-line bg-surface p-6"
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }}>
      <fieldset>
        <legend className="text-lg font-bold">how would you like a review reminder?</legend>
        <p className="mt-2 text-ink-soft">choose an option to preview it. reminders are coming later.</p>
        <div className="mt-4 space-y-3">
          <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md border border-control bg-page p-4">
            <input type="radio" name={`${id}-channel`} value="phone" checked={channel === 'phone'}
              onChange={() => setChannel('phone')} aria-describedby={`${id}-iphone`}
              className="h-5 w-5 shrink-0 accent-ink" />
            <span>phone notifications</span>
          </label>
          <p id={`${id}-iphone`} className="text-sm text-ink-soft">
            on iphone, add cueory to your home screen as a web app first.
          </p>
          <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md border border-control bg-page p-4">
            <input type="radio" name={`${id}-channel`} value="email" checked={channel === 'email'}
              onChange={() => setChannel('email')} className="h-5 w-5 shrink-0 accent-ink" />
            <span>email reminders</span>
          </label>
        </div>
      </fieldset>
      <p role="status" aria-atomic="true" className="mt-4 text-sm">
        {channel && `${channel === 'phone' ? 'phone notifications' : 'email reminders'} selected for this preview. nothing is enabled or saved.`}
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" disabled aria-describedby={`${id}-notice`}
          className={`${button} border border-control bg-page text-ink-soft`}>reminders coming soon</button>
        <button type="button" className={`${button} bg-button text-on-button hover:bg-button-hover`}
          onClick={close}>not now</button>
      </div>
    </div>
  </div>;
}
