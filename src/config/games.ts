/**
 * The daily games on /play (D-61), in the lowercase brand voice (D-47), shown together as "cueory games". The names
 * shown to visitors live only here, so a rename is one line. For now they are plain names (D-66): a trademark screen
 * found live US filings for cueword, triage and suture, so Christian chose plain names until he picks final ones.
 * The ids stay as they are: they are only used inside the code and the content folders. Each game has original rules
 * and an original look (CLAUDE.md): never the name, the colors, the tile grid or the colored-square shares of another
 * word game.
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
    name: 'pulse',
    line: 'guess the word of the day in seven beats. a guess spends a beat, and so does the cue.',
    ready: true,
  },
  { id: 'cueword', name: 'crossword', line: 'a small crossword.', ready: false },
  {
    id: 'triage',
    name: 'sort',
    line: 'sort ten terms into three groups. one fits none of them. three slips end the round.',
    ready: true,
  },
  { id: 'suture', name: 'word path', line: 'trace hidden words through a grid of letters.', ready: false },
];

/** The name visitors see for a game. */
export function gameName(id: DailyGame['id']): string {
  return dailyGames.find((game) => game.id === id)!.name;
}

/** Names and words the games must never use (CLAUDE.md). */
export const forbiddenGameWords = ['wordle', 'connections', 'strands', 'nyt', 'new york times'] as const;
