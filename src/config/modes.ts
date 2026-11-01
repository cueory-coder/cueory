/**
 * The study modes on the home page's "ways to study" merry-go-round (D-50, D-57), in Christian's order. Copy is in the
 * lowercase brand voice (D-47). A mode with a `link` is open now; the rest say "coming soon". Change names, wording or
 * order here; the carousel, its preview and its tests follow.
 *
 * The last three come from the roadmap: label it (Task 4c), adaptive quiz and level test (Task 4b). The video card
 * replaced "lesson": the sentence-by-sentence reader stays inside each lesson as its read-along text.
 */
export interface StudyMode {
  /** Used in the card's address (#mode-…) and to pick its illustration. */
  id:
    | 'video'
    | 'cards'
    | 'learn'
    | 'fill-in'
    | 'matching'
    | 'organizer'
    | 'questions'
    | 'review'
    | 'label-it'
    | 'adaptive-quiz'
    | 'level-test';
  name: string;
  text: string;
  /** Two plain lines for the preview panel: what you do, and why it helps. */
  more: string;
  /** Where the mode is open now, with the words on its link. */
  link?: { href: string; label: string };
}

export const studyModes: readonly StudyMode[] = [
  {
    id: 'video',
    name: 'video',
    text: 'watch the short lesson video.',
    more: 'each lesson has a short video. one tap on its cover starts it, and nothing plays or loads before you tap.',
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
  {
    id: 'label-it',
    name: 'label it',
    text: 'uncover the labels on a diagram, one at a time.',
    more: 'the labels on a diagram are covered. you reveal them one at a time, or all at once, and mark each one know it or still learning.',
  },
  {
    id: 'adaptive-quiz',
    name: 'adaptive quiz',
    text: 'questions that follow what you miss.',
    more: 'simple written rules pick your next question from your own results: more on what you miss, harder ones once you have a concept down.',
  },
  {
    id: 'level-test',
    name: 'level test',
    text: 'see where you stand on every concept in a unit.',
    more: 'one test for each unit shows where you stand on every concept in it, in plain words. it never predicts an exam score.',
  },
];
