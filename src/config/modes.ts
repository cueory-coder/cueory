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
  /** Two plain lines for the preview panel: what you do, and why it helps. */
  more: string;
  /** Where the mode is open now, with the words on its link. */
  link?: { href: string; label: string };
}

export const studyModes: readonly StudyMode[] = [
  {
    id: 'lesson',
    name: 'lesson',
    text: 'read a lesson one short sentence at a time.',
    more: 'you read one short sentence at a time and tap when you are ready for the next. small steps keep a long chapter from turning into a wall of text.',
    link: { href: '/learn/study-skills', label: 'read lesson 1' },
  },
  {
    id: 'cards',
    name: 'cards',
    text: 'flip through the key ideas.',
    more: 'flip a card to check yourself, then sort it into know it or still learning. the cards you are still learning come back in the next round.',
    link: { href: '/learn/study-skills/cards', label: 'try the cards' },
  },
  {
    id: 'learn',
    name: 'learn',
    text: 'see each card, pick its answer, then type it, until you know them all.',
    more: 'each card climbs three steps: see it, pick its answer, then type it. anything you miss comes back until you know every card.',
    link: { href: '/learn/study-skills/learn-mode', label: 'try learn mode' },
  },
  {
    id: 'fill-in',
    name: 'fill-in',
    text: 'recall the missing word.',
    more: 'you read a sentence with one word missing and type the word yourself, so you practice recalling it, not just recognizing it.',
  },
  {
    id: 'matching',
    name: 'matching',
    text: 'pair terms with what they mean.',
    more: 'pick a term, then the meaning that goes with it, in either order. no dragging and no timer, so you can think it through.',
    link: { href: '/learn/study-skills/matching', label: 'try matching' },
  },
  {
    id: 'organizer',
    name: 'organizer',
    text: 'sort ideas into groups by tapping, typing or dragging.',
    more: 'you sort ideas into the groups they belong to. putting them side by side shows how they relate to each other.',
  },
  {
    id: 'questions',
    name: 'questions',
    text: 'practice questions, each with a rationale.',
    more: 'you answer practice questions, then read why each choice is right or wrong, not just which one was.',
  },
  {
    id: 'review',
    name: 'review',
    text: 'come back at the right time, paced to your exam date.',
    more: 'cards you have studied come back after about a day, three days, a week and two weeks, adjusted to your exam date.',
  },
];
