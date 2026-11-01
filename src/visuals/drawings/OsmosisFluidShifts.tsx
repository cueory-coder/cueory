/**
 * Osmosis and fluid shifts (visuals kit, first batch; D-72, D-81). Drawn only from
 * content/visuals/osmosis-fluid-shifts.json: every word is one of its labels and every part names the depiction it
 * shows (`data-depiction`), which the unit tests check both ways.
 *
 * Solute concentration is shown as how many dots an area holds, so fewer dots means a lesser concentration and more
 * dots a greater one. Arrows show the direction the book states. There is no energy symbol anywhere, because the book
 * calls osmosis passive transport. Nothing about what a membrane, albumin or a cell looks like is drawn beyond plain
 * shapes.
 */
import type { ReactNode } from 'react';
import type { Visual } from '../sources';
import type { DrawingStep } from '../drawing';
import { ArrowHead, Label, type LabelProps } from './parts';

export const steps: readonly DrawingStep[] = [
  {
    id: 'osmosis',
    caption: [['osmosis'], ['membrane'], ['passive']],
    depictions: ['water-crosses', 'large-blocked', 'no-energy'],
  },
  {
    id: 'capillary',
    caption: [['arterial-end', 'hydrostatic'], ['venous-end', 'oncotic']],
    depictions: ['arterial-push', 'venous-pull', 'albumin-holds'],
  },
  {
    id: 'compartments',
    caption: [['intracellular'], ['interstitial'], ['intravascular']],
    depictions: ['between-compartments', 'pulled-into-blood', 'cells-shrink'],
  },
];

const WIDTH = 360;
const HEIGHT = 900;

interface Props {
  visual: Visual;
  /** How many steps are on screen: 1 shows the first step, `steps.length` (the default) shows the whole drawing. */
  shown?: number;
  /** Prefix for the drawing's marker and pattern ids, so two copies on one page don't share them. */
  idPrefix?: string;
}

/** Dots standing for dissolved solutes, at fixed places so the drawing never changes between renders. */
function Solutes({ points }: { points: readonly (readonly [number, number])[] }) {
  return (
    <g className="fill-ink">
      {points.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3" />
      ))}
    </g>
  );
}

export default function OsmosisFluidShifts({ visual, shown = steps.length, idPrefix = 'osmosis-fluid-shifts' }: Props) {
  const arrow = `${idPrefix}-arrow`;
  const dots = `${idPrefix}-dots`;
  const text = (id: string, x: number, y: number, options: Omit<LabelProps, 'visual' | 'id' | 'x' | 'y'> = {}): ReactNode => (
    <Label visual={visual} id={id} x={x} y={y} {...options} />
  );
  const line = (d: string, extra: Record<string, string> = {}) => (
    <path d={d} fill="none" strokeWidth="2" className="stroke-ink" markerEnd={`url(#${arrow})`} {...extra} />
  );

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="block h-auto w-full max-w-md"
      aria-hidden="true"
      focusable="false"
      data-visual={visual.id}
    >
      <defs>
        <ArrowHead id={arrow} />
        <pattern id={dots} width="10" height="10" patternUnits="userSpaceOnUse">
          <rect width="10" height="10" className="fill-page" />
          <circle cx="5" cy="5" r="1.4" className="fill-highlight" />
        </pattern>
      </defs>

      {/* Step 1: osmosis across a semipermeable membrane. */}
      <g data-depiction="water-crosses large-blocked no-energy">
        {text('osmosis', 8, 22, { size: 17, strong: true })}
        <rect x="8" y="36" width="344" height="176" rx="12" strokeWidth="1.5" className="fill-page stroke-line" />
        {text('lesser', 94, 60, { size: 13, max: 16, anchor: 'middle', soft: true })}
        {text('greater', 266, 60, { size: 13, max: 16, anchor: 'middle', soft: true })}
        <Solutes points={[[60, 186], [124, 110], [96, 196]]} />
        <Solutes
          points={[
            [214, 106], [250, 100], [292, 110], [326, 102], [232, 186], [268, 196],
            [304, 184], [336, 194], [220, 150], [330, 152],
          ]}
        />
        <g data-depiction="water-crosses">
          {text('water-movement', 112, 136, { size: 14, anchor: 'middle' })}
          {line('M56 152 H300')}
        </g>
        <g data-depiction="large-blocked">
          {line('M150 184 H200', { strokeWidth: '1.5' })}
          <circle cx="146" cy="184" r="3" className="fill-ink" />
          <circle cx="160" cy="112" r="9" strokeWidth="2" className="fill-surface stroke-ink" />
          <circle cx="160" cy="200" r="9" strokeWidth="2" className="fill-surface stroke-ink" />
        </g>
        <line x1="180" y1="36" x2="180" y2="212" strokeWidth="3" strokeDasharray="12 7" className="stroke-ink" />
        {text('membrane', 188, 234, { size: 14 })}
        {text('larger-blocked', 8, 262, { size: 14, soft: true })}
        <path d="M70 248 L153 208" fill="none" strokeWidth="1" className="stroke-ink-soft" />
        {text('passive', 8, 290, { size: 14, strong: true })}
      </g>

      {/* Step 2: a capillary, pushed out at the arterial end and pulled back in at the venous end. */}
      {shown >= 2 && (
        <g data-depiction="arterial-push venous-pull albumin-holds">
          <rect x="8" y="318" width="344" height="218" rx="12" fill={`url(#${dots})`} strokeWidth="1.5" className="stroke-line" />
          {text('interstitial', 20, 342, { size: 14, halo: true })}
          <g data-depiction="arterial-push">
            {text('hydrostatic', 24, 372, { size: 14, max: 12, halo: true, strong: true })}
            {line('M76 428 V392')}
            {line('M108 428 V392')}
          </g>
          <g data-depiction="venous-pull">
            {text('oncotic', 336, 372, { size: 14, max: 10, anchor: 'end', halo: true, strong: true })}
            {line('M252 392 V426')}
            {line('M284 392 V426')}
          </g>
          <rect x="24" y="432" width="312" height="66" rx="33" strokeWidth="2" className="fill-surface stroke-ink" />
          {text('capillary', 180, 460, { anchor: 'middle', strong: true })}
          <g data-depiction="albumin-holds">
            {text('albumin', 180, 484, { size: 13, anchor: 'middle' })}
          </g>
          {text('arterial-end', 28, 522, { size: 14, halo: true })}
          {text('venous-end', 332, 522, { size: 14, anchor: 'end', halo: true })}
        </g>
      )}

      {/* Step 3: fluid pulled into the intravascular compartment, and a cell shrinking as fluid leaves it. */}
      {shown >= 3 && (
        <g data-depiction="between-compartments pulled-into-blood">
          <rect x="24" y="566" width="312" height="80" rx="12" strokeWidth="1.5" className="fill-surface stroke-ink" />
          {text('intracellular', 40, 594, { max: 18, strong: true })}
          <g data-depiction="cells-shrink">
            <circle cx="276" cy="606" r="28" strokeWidth="1.5" strokeDasharray="5 4" fill="none" className="stroke-ink-soft" />
            <circle cx="276" cy="606" r="17" strokeWidth="2" className="fill-page stroke-ink" />
          </g>
          {line('M180 650 V688')}
          <rect x="24" y="694" width="312" height="80" rx="12" strokeWidth="1.5" className="fill-page stroke-ink" />
          {text('interstitial', 40, 722, { max: 18, strong: true })}
          {line('M180 778 V816')}
          <rect x="24" y="822" width="312" height="70" rx="12" strokeWidth="1.5" className="fill-surface stroke-ink" />
          {text('intravascular', 40, 850, { max: 18, strong: true })}
          <Solutes points={[[226, 840], [252, 852], [276, 838], [300, 858], [318, 842], [238, 872], [288, 876]]} />
        </g>
      )}
    </svg>
  );
}
