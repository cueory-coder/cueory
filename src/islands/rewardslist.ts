/**
 * Turns the existing local-only rewards model into plain-language preview rows.
 * No clock, storage, network, account data or real study content is used.
 */
import { applyResult, emptyRewards, weekKey, type RewardEvent } from './rewards';

export interface LabeledSampleEvent {
  /** Visible label. This preview accepts bracketed sample labels only. */
  readonly label: string;
  readonly event: RewardEvent;
}

export interface RewardSummaryRow {
  readonly id: string;
  readonly label: string;
  readonly text: string;
}

export interface RewardEventRow {
  readonly id: string;
  readonly label: string;
  readonly text: string;
}

export interface RewardAchievementRow {
  readonly id: string;
  readonly name: string;
  readonly day: string;
}

export interface RewardsPreview {
  readonly today: string;
  readonly summary: readonly RewardSummaryRow[];
  readonly events: readonly RewardEventRow[];
  readonly achievements: readonly RewardAchievementRow[];
}

const counted = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

/**
 * Apply each labeled sample in calendar order, with the model's day explicitly supplied.
 * Using a sample's own date is necessary for a multi-day demonstration: the real model
 * rejects events more than one day old at the time they are submitted.
 *
 * A rejected, invalid, duplicate or future sample is a fixture error, not a hidden
 * success. This is display-only: never persist the returned values.
 */
export function buildRewardsPreview(samples: readonly LabeledSampleEvent[], today: string): RewardsPreview {
  weekKey(today); // Validate the caller's fixed YYYY-MM-DD date, including real calendar days.
  let state = emptyRewards();
  const events: RewardEventRow[] = [];
  const ordered = samples
    .map((sample, index) => ({ sample, index }))
    .sort((a, b) => a.sample.event.day.localeCompare(b.sample.event.day) || a.index - b.index);

  for (const { sample, index } of ordered) {
    if (!/^\[sample [^\]\r\n]{1,120}\]$/.test(sample.label)) {
      throw new Error('rewards preview needs bracketed sample event labels.');
    }
    if (sample.event.day > today) throw new Error('rewards preview cannot show a future sample event.');
    const applied = applyResult(state, sample.event, sample.event.day);
    if (!applied.accepted) throw new Error('rewards preview sample event was rejected by the rewards model.');
    state = applied.state;
    const kind = sample.event.type === 'game' ? 'finished game' : 'finished study session';
    events.push({
      id: `sample-${index + 1}`,
      label: sample.label,
      text: `${counted(applied.pointsEarned, 'point', 'points')} earned for this ${kind} on ${sample.event.day}.`,
    });
  }

  return {
    today,
    summary: [
      { id: 'points', label: 'total points', text: `${counted(state.points, 'point', 'points')} earned.` },
      { id: 'games', label: 'finished games', text: `${counted(state.games.length, 'game', 'games')} finished.` },
      { id: 'studies', label: 'finished study sessions', text: `${counted(state.studies.length, 'session', 'sessions')} finished.` },
      { id: 'current-streak', label: 'game streak after these samples', text: `${counted(state.currentStreak, 'day', 'days')} in the current streak.` },
      { id: 'best-streak', label: 'best game streak', text: `${counted(state.bestStreak, 'day', 'days')} in the best streak.` },
      { id: 'passes', label: 'free passes remaining this week', text: `${counted(state.passesLeftThisWeek, 'free pass', 'free passes')} left.` },
      { id: 'achievements', label: 'achievements earned', text: `${counted(state.achievements.length, 'achievement', 'achievements')} earned.` },
    ],
    events,
    achievements: state.achievements.map((achievement) => ({
      id: achievement.id,
      name: achievement.name,
      day: achievement.earnedDate,
    })),
  };
}
