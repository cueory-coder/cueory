import { useId, useRef, type ReactNode } from 'react';
import '../styles/how-to-play.css';

/** Rules only: opening help does not pause, reset or save a round. */
export default function HowToPlay({ game, children, onOpenChange }: {
  game: string;
  children: ReactNode;
  onOpenChange?: (open: boolean) => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  return <>
    <button ref={opener} type="button" className="how-to-play-trigger" aria-label={`how to play ${game}`} aria-haspopup="dialog" aria-controls={id} onClick={() => {
      dialog.current?.showModal();
      onOpenChange?.(true);
      close.current?.focus();
    }}>?</button>
    <dialog ref={dialog} id={id} className="how-to-play-dialog" aria-labelledby={`${id}-title`} onClose={() => {
      onOpenChange?.(false);
      opener.current?.focus();
    }} onKeyDown={(event) => {
      // The close button is the only interactive element in these rules.
      if (event.key === 'Tab') { event.preventDefault(); close.current?.focus(); }
      // Keep game-level keyboard shortcuts out of the modal.
      event.stopPropagation();
    }}>
      <div className="how-to-play-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id={`${id}-title`} className="text-xl font-bold">how to play {game}</h3>
          <button ref={close} type="button" className="how-to-play-close" onClick={() => dialog.current?.close()}>close help</button>
        </div>
        <div className="mt-4 flex flex-col gap-3 text-ink-soft">{children}</div>
      </div>
    </dialog>
  </>;
}
