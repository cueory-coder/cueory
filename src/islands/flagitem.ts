/**
 * Which question the "flag or comment" button is about, for pages whose items load in the browser (Task 172).
 *
 * Layout's `flagItem` prop is fixed when the page is built. The real questions page only learns its item and version
 * ids after it reads the database, and the current one changes as the student moves on, so the questions island
 * publishes it here and the flag form can read it when a report is sent. Islands on one page share this module.
 * Only database UUIDs are kept: flagsend.ts drops anything else, so a sample slug never reaches submit_flag.
 */
export interface FlagItem { itemId: string; itemVersionId: string }
export type FlagItemListener = (item: FlagItem | undefined) => void;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let current: FlagItem | undefined;
const listeners = new Set<FlagItemListener>();

/** Sets (or, with undefined, clears) the item the page is showing. An invalid pair clears it. */
export function setFlagItem(item: FlagItem | undefined): void {
  const next = item && UUID.test(item.itemId) && UUID.test(item.itemVersionId)
    ? { itemId: item.itemId, itemVersionId: item.itemVersionId } : undefined;
  if (current?.itemId === next?.itemId && current?.itemVersionId === next?.itemVersionId) return;
  current = next;
  for (const listener of [...listeners]) {
    try { listener(current && { ...current }); } catch { /* one listener's failure never stops the others */ }
  }
}

/** The item the page is showing now, if it has told us. */
export const currentFlagItem = (): FlagItem | undefined => current && { ...current };

/** Calls `listener` whenever the item changes. Returns the function that stops it. */
export function onFlagItem(listener: FlagItemListener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
