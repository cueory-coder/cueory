interface Props {
  know: number;
  learning: number;
  notStarted: number;
}

const radius = 30;
const circumference = 2 * Math.PI * radius;

/** Decorative only; visible words beside the ring carry the full meaning. No animations. */
export default function ProgressRing({ know, learning, notStarted }: Props) {
  const total = know + learning + notStarted;
  const knowArc = total > 0 ? (know / total) * circumference : 0;
  const learningArc = total > 0 ? (learning / total) * circumference : 0;

  return (
    <svg viewBox="0 0 80 80" className="size-20 shrink-0" aria-hidden="true" focusable="false">
      <g transform="rotate(-90 40 40)">
        <circle cx="40" cy="40" r={radius} fill="none" stroke="currentColor" strokeWidth="8" className="text-line" />
        {knowArc > 0 && (
          <circle
            cx="40" cy="40" r={radius} fill="none" stroke="currentColor" strokeWidth="8" className="text-ink"
            strokeDasharray={String(knowArc) + ' ' + String(circumference - knowArc)}
          />
        )}
        {learningArc > 0 && (
          <circle
            cx="40" cy="40" r={radius} fill="none" stroke="currentColor" strokeWidth="8" className="text-ink-soft"
            strokeDasharray={String(learningArc) + ' ' + String(circumference - learningArc)}
            strokeDashoffset={-knowArc}
          />
        )}
      </g>
    </svg>
  );
}
