/**
 * Printing one daily game from /play (Task 641). The game's print button marks the page with the game's id
 * (`data-print-game` on the root element), so the game's own @media print rules can leave out everything else on the
 * page, then opens the browser's print dialog. The mark is removed once printing is over, so a later Ctrl+P prints the
 * whole page again. Kept in a plain file so it can be unit tested without a browser.
 */
export interface PrintTarget {
  document: { documentElement: { dataset: DOMStringMap } };
  addEventListener(type: 'afterprint', listener: () => void, options: { once: true }): void;
  print(): void;
}

export function printGame(game: string, target: PrintTarget = window): void {
  const root = target.document.documentElement;
  root.dataset.printGame = game;
  target.addEventListener('afterprint', () => {
    if (root.dataset.printGame === game) delete root.dataset.printGame;
  }, { once: true });
  target.print();
}
