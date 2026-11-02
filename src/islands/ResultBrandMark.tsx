/**
 * A result-only, decorative brand credit for React game islands.
 * Astro components cannot be mounted inside React islands. Use the identical
 * official emblem assets and CSS mode-switch classes as Wordmark.astro.
 * Never render this in a question, answer or active study control.
 */
interface Props {
  /** Existing route, not a made-up /<game> page. */
  path: '/play' | '/progress';
}

export default function ResultBrandMark({ path }: Props) {
  return (
    <span
      data-testid="result-brand-mark"
      aria-hidden="true"
      className="mt-4 inline-flex select-none items-center gap-2 print:hidden"
    >
      <span className="logo block w-3.5 shrink-0">
        <img
          className="logo-day"
          src="/brand/v1/emblem-light-96.png"
          srcSet="/brand/v1/emblem-light-96.png 96w, /brand/v1/emblem-light-192.png 192w, /brand/v1/emblem-light-384.png 384w"
          sizes="0.875rem"
          width={384}
          height={428}
          alt=""
          decoding="async"
          draggable={false}
        />
        <img
          className="logo-evening"
          src="/brand/v1/emblem-dark-96.png"
          srcSet="/brand/v1/emblem-dark-96.png 96w, /brand/v1/emblem-dark-192.png 192w, /brand/v1/emblem-dark-384.png 384w"
          sizes="0.875rem"
          width={384}
          height={428}
          alt=""
          decoding="async"
          draggable={false}
        />
      </span>
      <span className="font-body text-sm leading-relaxed text-ink">{'cueory.app' + path}</span>
    </span>
  );
}
