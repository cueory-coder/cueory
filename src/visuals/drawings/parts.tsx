/**
 * Shared pieces for the visuals kit's drawings (D-81): a label drawn from the visual's source file, and an arrowhead.
 * Every `<text>` in a drawing comes from `Label`, so its words are always one of the file's labels.
 */
import { labelText, type Visual } from '../sources';
import { wrapLines } from '../drawing';

export interface LabelProps {
  visual: Pick<Visual, 'id' | 'labels'>;
  id: string;
  x: number;
  y: number;
  size?: number;
  /** Longest line, in characters, before the label wraps at a space. */
  max?: number;
  anchor?: 'start' | 'middle' | 'end';
  strong?: boolean;
  soft?: boolean;
  /** A page-colored outline behind the letters, for labels drawn over a pattern. */
  halo?: boolean;
}

export function Label({ visual, id, x, y, size = 15, max = 40, anchor = 'start', strong, soft, halo }: LabelProps) {
  const classes = [soft ? 'fill-ink-soft' : 'fill-ink', strong ? 'font-semibold' : '', halo ? 'stroke-page' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <text
      data-label={id}
      x={x}
      y={y}
      fontSize={size}
      textAnchor={anchor}
      className={classes}
      {...(halo ? { strokeWidth: 5, paintOrder: 'stroke', strokeLinejoin: 'round' as const } : {})}
    >
      {wrapLines(labelText(visual, id), max).map((line, index) => (
        <tspan key={index} x={x} dy={index === 0 ? 0 : size * 1.25}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

/** An arrowhead marker, colored like the line it ends. Put it in the drawing's `<defs>`. */
export function ArrowHead({ id }: { id: string }) {
  return (
    <marker id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" className="fill-ink" />
    </marker>
  );
}
