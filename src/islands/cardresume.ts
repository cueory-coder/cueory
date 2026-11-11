import type { ResumeSnapshot } from '../scripts/resume';
import type { CardsState, Pile } from './cards';

/** Card IDs cannot contain "_", so this saved-order key cannot clash with a card's mark. */
export const CARD_ROUND_KEY = 'round_ids';

/** Rebuilds the exact round from a validated snapshot and this deck's current public card IDs. */
export function restoreCardRound(snapshot: ResumeSnapshot, deckId: string, cards: readonly { id: string }[], page: string
): { state: CardsState; shuffle: boolean; starredOnly: boolean } | null {
  if (snapshot.tool !== 'cards' || snapshot.page !== page || snapshot.module !== deckId) return null;
  const flags = /^r([1-9]\d*)-s([01])-t([01])$/.exec(snapshot.step ?? '');
  if (!flags || !cards.length || snapshot.totalItems > cards.length) return null;
  const roundNumber = Number(flags[1]);
  if (!Number.isSafeInteger(roundNumber) || roundNumber > 9999) return null;
  const shuffle = flags[2] === '1', starredOnly = flags[3] === '1';
  const byId = new Map(cards.map((card, i) => [card.id, i]));
  if (byId.size !== cards.length) return null;
  const { [CARD_ROUND_KEY]: packed, ...marks } = snapshot.answers;
  if (!Array.isArray(packed) || !packed.length) return null;
  const roundIds = packed.join(' ').split(' ');
  if (roundIds.length !== snapshot.totalItems || new Set(roundIds).size !== roundIds.length) return null;
  const round = roundIds.map((id) => byId.get(id));
  if (round.some((index) => index === undefined)) return null;
  const pairs = Object.entries(marks);
  if (pairs.some(([, value]) => value !== 'know' && value !== 'learning')) return null;
  const finished = snapshot.phase === 'results';
  if (finished && snapshot.itemIndex !== roundIds.length - 1) return null;
  const answeredIds = roundIds.slice(0, finished ? roundIds.length : snapshot.itemIndex);
  if (pairs.length !== answeredIds.length || answeredIds.some(id => !Object.hasOwn(marks, id))) return null;
  if (snapshot.itemId !== roundIds[snapshot.itemIndex]) return null;
  // Integer object keys enumerate numerically, even when cards were studied in a different order.
  // The saved round is authoritative. Each answered card must have exactly one valid mark.
  return { shuffle, starredOnly, state: {
    round: round as number[], pos: pairs.length, flipped: false,
    marks: answeredIds.map(id => marks[id] as Pile), roundNumber, touched: true,
  } };
}
