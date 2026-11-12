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

export type InfoTipAction =
  | { type: 'toggle'; id: string }
  | { type: 'outside'; insideOpenPanel: boolean }
  | { type: 'escape' };

/** Which tip may be open after one user action. A second open replaces the first. */
export function nextOpenInfoTip(current: string | null, action: InfoTipAction): string | null {
  if (action.type === 'toggle') return current === action.id ? null : action.id;
  if (action.type === 'outside') return action.insideOpenPanel ? current : null;
  return null;
}

/** Only announce genuinely new, visible text while its tip is open. */
export function changedInfoTipText(previous: string, next: string, open: boolean): string | null {
  const clean = (value: string) => value.replace(/\s+/g, ' ').trim();
  const latest = clean(next);
  return open && latest && latest !== clean(previous) ? latest : null;
}

const panelOf = (button: HTMLElement, root: Document): HTMLElement | null => {
  const id = button.getAttribute('aria-controls');
  return id ? root.getElementById(id) : null;
};

function openButton(root: Document): HTMLElement | null {
  return root.querySelector<HTMLElement>('[data-infotip][aria-expanded="true"]');
}

interface ObservedInfoTip {
  lastText: string;
  live: HTMLElement | null;
}
const observations = new WeakMap<HTMLElement, ObservedInfoTip>();
const watchedPanels = new WeakSet<HTMLElement>();

function visibleTipText(panel: HTMLElement): string {
  // innerText respects nested hidden feature rows in the mode preview.
  return panel.innerText.replace(/\s+/g, ' ').trim();
}

function renderInfoTip(button: HTMLElement, open: boolean, root: Document): void {
  const panel = panelOf(button, root);
  if (!panel) {
    button.setAttribute('aria-expanded', 'false');
    return;
  }
  button.setAttribute('aria-expanded', String(open));
  panel.hidden = !open;
  const observed = observations.get(panel);
  if (observed) {
    observed.lastText = open ? visibleTipText(panel) : '';
    if (observed.live) observed.live.textContent = '';
  }
}

/** Opens or closes one ⓘ. Direct callers cannot leave two panels expanded. */
export function setInfoTip(button: HTMLElement, open: boolean, root: Document = document): void {
  if (open) {
    for (const other of root.querySelectorAll<HTMLElement>('[data-infotip][aria-expanded="true"]')) {
      if (other !== button) renderInfoTip(other, false, root);
    }
  }
  renderInfoTip(button, open, root);
}

/** Gives an ⓘ a new label and closes it, preserving the carousel's prior behavior. */
export function relabelInfoTip(button: HTMLElement, label: string, root: Document = document): void {
  button.setAttribute('aria-label', infoTipName(label));
  setInfoTip(button, false, root);
}

/** Observe text changes only within the matching panel. The live region is outside it. */
function watchInfoTip(button: HTMLElement, root: Document): void {
  const panel = panelOf(button, root);
  if (!panel || watchedPanels.has(panel) || typeof MutationObserver === 'undefined') return;
  watchedPanels.add(panel);
  const next = panel.nextElementSibling;
  const live = next?.matches('[data-infotip-live]') ? next as HTMLElement : null;
  const observed: ObservedInfoTip = { lastText: '', live };
  observations.set(panel, observed);
  new MutationObserver(() => {
    if (button.getAttribute('aria-expanded') !== 'true') return;
    const updated = visibleTipText(panel);
    const message = changedInfoTipText(observed.lastText, updated, true);
    observed.lastText = updated;
    if (message && observed.live) observed.live.textContent = message;
  }).observe(panel, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden'] });
}

const bound = new WeakSet<Document>();

export function bindInfoTips(root: Document): void {
  // Repeated calls can reveal newly inserted tips without adding listeners again.
  for (const button of root.querySelectorAll<HTMLElement>('[data-infotip]')) {
    watchInfoTip(button, root);
    button.classList.remove('invisible');
  }
  if (bound.has(root)) return;
  bound.add(root);

  root.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest<HTMLElement>('[data-infotip]');
    const active = openButton(root);
    const currentId = active?.getAttribute('aria-controls') ?? null;
    if (button && root.contains(button)) {
      const id = button.getAttribute('aria-controls');
      if (id) setInfoTip(button, nextOpenInfoTip(currentId, { type: 'toggle', id }) === id, root);
      return;
    }
    const inPanel = !!active && target?.closest('[data-infotip-panel]') === panelOf(active, root);
    if (active && nextOpenInfoTip(currentId, { type: 'outside', insideOpenPanel: inPanel }) === null) {
      setInfoTip(active, false, root);
    }
  });

  // Escape only belongs to a tip when focus is on its button or inside its panel.
  // Elsewhere, close quietly and let another dialog, menu or control handle Escape.
  root.addEventListener('keydown', (event) => {
    const active = openButton(root);
    if (!active || !closesInfoTip(event.key, true)) return;
    const target = event.target instanceof Element ? event.target : null;
    const panel = panelOf(active, root);
    const insideTip = !!target && (active.contains(target) || (panel?.contains(target) ?? false));
    if (nextOpenInfoTip(active.getAttribute('aria-controls'), { type: 'escape' }) === null) {
      setInfoTip(active, false, root);
      if (!insideTip) return;
      event.preventDefault();
      event.stopPropagation();
      active.focus();
    }
  }, true);
}
