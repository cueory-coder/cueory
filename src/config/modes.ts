/**
 * The study modes on the home page's "ways to study" merry-go-round (D-50, D-60), in Christian's order. Copy is in the
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
  /**
   * Its vial on the home page (Task 109): public/vials/vial-<vial>.webp, one of Christian's bottles with a blank
   * label. The label's words are live text in the page, never part of the image.
   */
  vial: StudyVial;
  /** The label's "best for" line: one or two words, lowercase. */
  bestFor: string;
  /** The label's "time" line: about how many minutes one sitting takes. */
  time: number;
  /** Four short rows in the preview, each with its outline icon. They say what the tool does, never what it scores. */
  features: readonly [StudyFeature, StudyFeature, StudyFeature, StudyFeature];
}

/** The vial images in public/vials/. `practice-exams` is there too, kept for a later mode (Task 109). */
export type StudyVial =
  | 'video-lessons'
  | 'flashcards'
  | 'learn-mode'
  | 'fill-in'
  | 'matching'
  | 'organizer'
  | 'questions'
  | 'spaced-review'
  | 'label-it'
  | 'adaptive-quiz'
  | 'level-test';

/** The small outline icons beside the preview's feature rows (drawn in ModesCarousel.astro). */
export type StudyFeatureIcon =
  | 'play'
  | 'tap'
  | 'eye'
  | 'text'
  | 'flip'
  | 'sort'
  | 'repeat'
  | 'spark'
  | 'steps'
  | 'type'
  | 'check'
  | 'link'
  | 'clock'
  | 'group'
  | 'list'
  | 'calendar'
  | 'target';

export interface StudyFeature {
  icon: StudyFeatureIcon;
  text: string;
}

export const studyModes: readonly StudyMode[] = [
  {
    id: 'video',
    name: 'video',
    text: 'watch the short lesson video.',
    more: 'each lesson has a short video. one tap on its cover starts it, and nothing plays or loads before you tap.',
    vial: 'video-lessons',
    bestFor: 'watch',
    time: 10,
    features: [
      { icon: 'play', text: 'a short video for each lesson' },
      { icon: 'tap', text: 'starts with one tap on its cover' },
      { icon: 'eye', text: 'nothing loads before you tap' },
      { icon: 'text', text: 'read-along text in the lesson' },
    ],
  },
  {
    id: 'cards',
    name: 'cards',
    text: 'flip through the key ideas.',
    more: 'flip a card to check yourself, then sort it into know it or still learning. the cards you are still learning come back in the next round.',
    link: { href: '/learn/study-skills/cards', label: 'try the cards' },
    vial: 'flashcards',
    bestFor: 'recall',
    time: 5,
    features: [
      { icon: 'flip', text: 'flip a card to check yourself' },
      { icon: 'sort', text: 'sort into know it or still learning' },
      { icon: 'repeat', text: 'still-learning cards come back' },
      { icon: 'spark', text: 'active recall' },
    ],
  },
  {
    id: 'learn',
    name: 'learn',
    text: 'see each card, pick its answer, then type it, until you know them all.',
    more: 'each card climbs three steps: see it, pick its answer, then type it. anything you miss comes back until you know every card.',
    link: { href: '/learn/study-skills/learn-mode', label: 'try learn mode' },
    vial: 'learn-mode',
    bestFor: 'master',
    time: 15,
    features: [
      { icon: 'steps', text: 'three steps: see, pick, type' },
      { icon: 'type', text: 'multiple question styles' },
      { icon: 'repeat', text: 'what you miss comes back' },
      { icon: 'check', text: 'ends when you know every card' },
    ],
  },
  {
    id: 'fill-in',
    name: 'fill-in',
    text: 'recall the missing word.',
    more: 'you read a sentence with one word missing and type the word yourself, so you practice recalling it, not just recognizing it.',
    link: { href: '/learn/study-skills/fill-in', label: 'try fill-in' },
    vial: 'fill-in',
    bestFor: 'recall',
    time: 5,
    features: [
      { icon: 'type', text: 'type the missing word' },
      { icon: 'target', text: 'recall it, not just recognize it' },
      { icon: 'text', text: 'one word missing per sentence' },
      { icon: 'spark', text: 'active recall' },
    ],
  },
  {
    id: 'matching',
    name: 'matching',
    text: 'pair terms with what they mean.',
    more: 'pick a term, then the meaning that goes with it, in either order. no dragging and no timer, so you can think it through.',
    link: { href: '/learn/study-skills/matching', label: 'try matching' },
    vial: 'matching',
    bestFor: 'connect',
    time: 5,
    features: [
      { icon: 'link', text: 'pair each term with its meaning' },
      { icon: 'tap', text: 'pick in either order' },
      { icon: 'eye', text: 'no dragging needed' },
      { icon: 'clock', text: 'no timer' },
    ],
  },
  {
    id: 'organizer',
    name: 'organizer',
    text: 'sort ideas into groups by tapping, typing or dragging.',
    more: 'you sort ideas into the groups they belong to. putting them side by side shows how they relate to each other.',
    link: { href: '/learn/study-skills/organizer', label: 'try the organizer' },
    vial: 'organizer',
    bestFor: 'group',
    time: 5,
    features: [
      { icon: 'group', text: 'sort ideas into groups' },
      { icon: 'tap', text: 'tap, type or drag' },
      { icon: 'list', text: 'ideas side by side' },
      { icon: 'link', text: 'see how they relate' },
    ],
  },
  {
    id: 'questions',
    name: 'questions',
    text: 'practice questions, each with a rationale.',
    more: 'you answer practice questions, then read why each choice is right or wrong, not just which one was.',
    link: { href: '/learn/study-skills/questions', label: 'try the questions' },
    vial: 'questions',
    bestFor: 'apply',
    time: 10,
    features: [
      { icon: 'list', text: 'practice questions' },
      { icon: 'check', text: 'single and select-all styles' },
      { icon: 'text', text: 'a rationale for every choice' },
      { icon: 'eye', text: 'why each one is right or wrong' },
    ],
  },
  {
    id: 'review',
    name: 'review',
    text: 'come back at the right time, paced to your exam date.',
    more: 'cards you have studied come back after about a day, three days, a week and two weeks, adjusted to your exam date.',
    vial: 'spaced-review',
    bestFor: 'keep it',
    time: 5,
    features: [
      { icon: 'calendar', text: 'cards come back over time' },
      { icon: 'clock', text: 'after a day, three days, a week' },
      { icon: 'target', text: 'paced to your exam date' },
      { icon: 'repeat', text: 'built from the cards you study' },
    ],
  },
  {
    id: 'label-it',
    name: 'label it',
    text: 'uncover the labels on a diagram, one at a time.',
    more: 'the labels on a diagram are covered. you reveal them one at a time, or all at once, and mark each one know it or still learning.',
    link: { href: '/learn/study-skills/label-it', label: 'try label it' },
    vial: 'label-it',
    bestFor: 'see it',
    time: 5,
    features: [
      { icon: 'eye', text: 'labels on a diagram are covered' },
      { icon: 'tap', text: 'reveal one or all at once' },
      { icon: 'sort', text: 'mark know it or still learning' },
      { icon: 'spark', text: 'active recall' },
    ],
  },
  {
    id: 'adaptive-quiz',
    name: 'adaptive quiz',
    text: 'questions that follow what you miss.',
    more: 'simple written rules pick your next question from your own results: more on what you miss, harder ones once you have a concept down.',
    vial: 'adaptive-quiz',
    bestFor: 'weak spots',
    time: 10,
    features: [
      { icon: 'steps', text: 'simple written rules pick the next question' },
      { icon: 'target', text: 'more on what you miss' },
      { icon: 'spark', text: 'harder ones once you have it' },
      { icon: 'list', text: 'built from your own answers' },
    ],
  },
  {
    id: 'level-test',
    name: 'level test',
    text: 'see where you stand on every concept in a unit.',
    more: 'one test for each unit shows where you stand on every concept in it, in plain words. it never predicts an exam score.',
    vial: 'level-test',
    bestFor: 'check in',
    time: 20,
    features: [
      { icon: 'list', text: 'one test for each unit' },
      { icon: 'group', text: 'every concept in the unit' },
      { icon: 'text', text: 'where you stand, in plain words' },
      { icon: 'check', text: 'never predicts an exam score' },
    ],
  },
];
