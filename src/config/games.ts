/**
 * The daily games on /play (D-61), in the lowercase brand voice (D-47), shown together as "cueory games". The names
 * shown to visitors live only here, so a rename is one line. For now they are plain names (D-66): a trademark screen
 * found live US filings for cueword, triage and suture, so Christian chose plain names until he picks final ones.
 * Christian named the word game pillo (Task 114); its id stays pulse. The ids stay as they are: they are only used
 * inside the code and the content folders. Each game has an original look (CLAUDE.md): never the name, the colors,
 * the tile grid or the colored-square shares of another word game. Rules are original too, with one exception
 * Christian chose (Task 113): pillo uses the classic guess-the-word rules, a five-letter word and six guesses, on its
 * own blister-pack board with brand-color pills, a symbol on every letter and a one-line share.
 */
export interface DailyGame {
  /** Inside the code only; never shown. */
  id: 'pulse' | 'cueword' | 'triage' | 'suture';
  /** The name visitors see, on /play, in headings and in the share line. */
  name: string;
  /** One line on what you do. */
  line: string;
  /** Playable now, with sample puzzles; the rest say "coming soon". */
  ready: boolean;
}

export const dailyGames: readonly DailyGame[] = [
  {
    id: 'pulse',
    name: 'pillo',
    line: 'guess the five-letter word in six tries. each guess marks every letter: in place, elsewhere in the word, or not in it.',
    ready: true,
  },
  {
    id: 'cueword',
    name: 'crossword',
    line: 'choose an easy, mid or hard crossword, then solve each crossing clue.',
    ready: true,
  },
  {
    id: 'triage',
    name: 'sort',
    line: 'sort ten terms into three groups. one fits none of them. three slips end the round.',
    ready: true,
  },
  {
    id: 'suture',
    name: 'word path',
    line: 'find the hidden words in a grid of letters. each one runs up, down, left or right, and has its own cue.',
    ready: true,
  },
];

/** The name visitors see for a game. */
export function gameName(id: DailyGame['id']): string {
  return dailyGames.find((game) => game.id === id)!.name;
}

/** Names and words the games must never use (CLAUDE.md). */
export const forbiddenGameWords = ['wordle', 'connections', 'strands', 'nyt', 'new york times'] as const;

/**
 * Hello cards (Task 201): a flip-the-card game of conversation starters for patients, co-workers and classmates. It is
 * not a daily puzzle, so it sits outside dailyGames (no score, no streak, no share). It is listed on /play.
 */
export const helloCardsGame = {
  name: 'hello cards',
  href: '/play/hello-cards',
  line: 'flip a card for a friendly conversation starter, for anyone you work or study with. choose small talk or a deeper conversation.',
} as const;

/** Keep the hello cards page out of search until Christian says otherwise, even once its wording is approved. */
export const helloCardsIndexWhenApproved = false;
