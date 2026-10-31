/**
 * The study modes on the home page's "ways to study" carousel (D-50), in Christian's order. Copy is in the lowercase
 * brand voice (D-47). A mode with an `href` is open now; the rest say "coming soon". Change names, wording or order
 * here; the carousel, its chips and its tests follow.
 */
export interface StudyMode {
  /** Used in the card's address (#mode-…) and to pick its illustration. */
  id: 'lesson' | 'cards' | 'learn' | 'fill-in' | 'matching' | 'organizer' | 'questions' | 'review';
  name: string;
  text: string;
  /** Where the mode is open now, with the words on its link. */
  link?: { href: string; label: string };
}

export const studyModes: readonly StudyMode[] = [
  {
    id: 'lesson',
    name: 'lesson',
    text: 'read a lesson one short sentence at a time.',
    link: { href: '/learn/study-skills', label: 'read lesson 1' },
  },
  {
    id: 'cards',
    name: 'cards',
    text: 'flip through the key ideas.',
    link: { href: '/learn/study-skills/cards', label: 'try the cards' },
  },
  {
    id: 'learn',
    name: 'learn',
    text: 'see each card, pick its answer, then type it, until you know them all.',
    link: { href: '/learn/study-skills/learn-mode', label: 'try learn mode' },
  },
  { id: 'fill-in', name: 'fill-in', text: 'recall the missing word.' },
  {
    id: 'matching',
    name: 'matching',
    text: 'pair terms with what they mean.',
    link: { href: '/learn/study-skills/matching', label: 'try matching' },
  },
  { id: 'organizer', name: 'organizer', text: 'sort ideas into groups by tapping, typing or dragging.' },
  { id: 'questions', name: 'questions', text: 'practice questions, each with a rationale.' },
  { id: 'review', name: 'review', text: 'come back at the right time, paced to your exam date.' },
];
