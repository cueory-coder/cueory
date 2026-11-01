/**
 * The daily games on /play (D-61), in the lowercase brand voice (D-47). The names are working names until Christian
 * picks: rename a game here, in one line. Each game has original rules and an original look (CLAUDE.md): never the
 * name, the colors, the tile grid or the colored-square shares of another word game.
 */
export interface DailyGame {
  id: 'pulse' | 'cueword' | 'triage' | 'suture';
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
  { id: 'cueword', name: 'cueword', line: 'a mini crossword.', ready: false },
  {
    id: 'triage',
    name: 'triage',
    line: 'sort ten terms into three groups. one fits none of them. three slips end the round.',
    ready: true,
  },
  { id: 'suture', name: 'suture', line: 'trace hidden words through a grid of letters.', ready: false },
];

/** Names and words the games must never use (CLAUDE.md). */
export const forbiddenGameWords = ['wordle', 'connections', 'strands', 'nyt', 'new york times'] as const;
