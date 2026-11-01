/**
 * Home page sections fade in with a small rise as they first come into view, once (D-62). Only the sections still
 * below the window when this runs are made to wait, so a section is never hidden without JavaScript, never hidden
 * once it is on screen, and with reduced motion nothing waits at all. The look is in global.css ([data-reveal]).
 */

/** A section waits for its reveal only if it starts below the window. */
export function waitsForReveal(top: number, viewportHeight: number): boolean {
  return top >= viewportHeight;
}

export function revealSections(): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        (entry.target as HTMLElement).dataset.reveal = 'shown';
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  );
  for (const section of document.querySelectorAll<HTMLElement>('[data-reveal-section]')) {
    if (!waitsForReveal(section.getBoundingClientRect().top, window.innerHeight)) continue;
    section.dataset.reveal = 'waiting';
    observer.observe(section);
  }
}
