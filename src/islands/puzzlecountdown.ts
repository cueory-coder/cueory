/** Daily games use the visitor's local calendar day, including daylight-saving changes. */
export function nextPuzzleAt(now: Date): number {
  if (!Number.isFinite(now.getTime())) throw new RangeError('a valid date is required');
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
}

export function puzzleCountdown(target: number, now: number) {
  const seconds = Math.max(0, Math.ceil((target - now) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  const remainder = seconds % 60;
  return {
    seconds,
    text: [hours, minutes, remainder].map((part) => String(part).padStart(2, '0')).join(':'),
    spoken: `${hours} ${hours === 1 ? 'hour' : 'hours'}, ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}, ${remainder} ${remainder === 1 ? 'second' : 'seconds'}`,
  };
}
