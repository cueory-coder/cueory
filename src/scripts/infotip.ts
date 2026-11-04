/**
 * The ⓘ buttons (src/components/InfoTip.astro). One listener on the page serves every button, including ones whose
 * words change later, like the study-mode preview's. Pure helpers are exported for the unit tests
 * (tests/unit/infotip.test.ts).
 */

/** The button's name: "more about cards". */
export function infoTipName(label: string): string {
  return `more about ${label}`;
}

/** Escape closes an open panel; every other key is left alone (Enter and Space press the button itself). */
export function closesInfoTip(key: string, open: boolean): boolean {
  return open && (key === 'Escape' || key === 'Esc');
}

const panelOf = (button: HTMLElement, root: Document) => {
  const id = button.getAttribute('aria-controls');
  return id ? root.getElementById(id) : null;
};

/** Opens or closes one ⓘ. */
export function setInfoTip(button: HTMLElement, open: boolean, root: Document = document): void {
  const panel = panelOf(button, root);
  button.setAttribute('aria-expanded', String(open));
  if (panel) panel.hidden = !open;
}

/** Gives an ⓘ a new label and closes it (used where one panel shows different words in turn). */
export function relabelInfoTip(button: HTMLElement, label: string, root: Document = document): void {
  button.setAttribute('aria-label', infoTipName(label));
  setInfoTip(button, false, root);
}

const bound = new WeakSet<Document>();

export function bindInfoTips(root: Document): void {
  if (bound.has(root)) return;
  bound.add(root);
  // Until now the buttons kept their space but stayed invisible: without this script they couldn't open.
  for (const button of root.querySelectorAll<HTMLElement>('[data-infotip]')) button.classList.remove('invisible');

  root.addEventListener('click', (event) => {
    const button = (event.target as Element | null)?.closest?.<HTMLElement>('[data-infotip]');
    if (!button) return;
    setInfoTip(button, button.getAttribute('aria-expanded') !== 'true', root);
  });

  // Escape on the button or inside its open panel closes that panel only, and goes no further, so a preview or
  // menu around it stays open. Focus goes back to the button.
  root.addEventListener(
    'keydown',
    (event) => {
      const target = event.target as Element | null;
      if (!target?.closest) return;
      const panel = target.closest<HTMLElement>('[data-infotip-panel]');
      const button = panel
        ? root.querySelector<HTMLElement>(`[data-infotip][aria-controls="${panel.id}"]`)
        : target.closest<HTMLElement>('[data-infotip]');
      if (!button || !closesInfoTip(event.key, button.getAttribute('aria-expanded') === 'true')) return;
      event.preventDefault();
      event.stopPropagation();
      setInfoTip(button, false, root);
      button.focus();
    },
    true,
  );
}
