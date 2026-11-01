/**
 * Body fluid compartments (visuals kit, first batch; D-72, D-81). Drawn only from content/visuals/fluid-compartments.json:
 * every word is one of its labels and every part carries the id of the depiction it shows (`data-depiction`), which the
 * unit tests check both ways. Shapes are plain: a bar split 60 to the rest for the two compartments, rounded boxes for
 * cells and a tube for the blood vessel. Nothing about how cells or blood look is drawn, because the book doesn't say.
 * Colors come from brand tokens, and the two compartments also differ by pattern (lines for ICF, dots for ECF) and by
 * their labels, so color is never the only signal.
 */
import type { ReactNode } from 'react';
import type { Visual } from '../sources';
import type { DrawingStep } from '../drawing';
import { Label, type LabelProps } from './parts';

export const steps: readonly DrawingStep[] = [
  {
    id: 'two-compartments',
    caption: [['icf', 'icf-share'], ['ecf']],
    depictions: ['two-compartments', 'icf-larger'],
  },
  { id: 'inside-cells', caption: [['icf'], ['icf-electrolyte']], depictions: ['icf-contents'] },
  { id: 'outside-cells', caption: [['ecf'], ['ecf-electrolyte']], depictions: ['two-compartments'] },
  {
    id: 'ecf-types',
    caption: [['intravascular'], ['interstitial'], ['transcellular']],
    depictions: ['ecf-types', 'intravascular-blood', 'interstitial-place', 'transcellular-places'],
  },
];

const WIDTH = 360;
const HEIGHT = 790;
/** The ICF's share of the bar: "intracellular fluid accounts for 60% of the volume of body fluids". */
const ICF_SHARE = 0.6;

interface Props {
  visual: Visual;
  /** How many steps are on screen: 1 shows the first step, `steps.length` (the default) shows the whole drawing. */
  shown?: number;
  /** Prefix for the drawing's pattern ids, so two copies on one page don't share them. */
  idPrefix?: string;
}

export default function FluidCompartments({ visual, shown = steps.length, idPrefix = 'fluid-compartments' }: Props) {
  const lines = idPrefix + '-icf-lines';
  const dots = idPrefix + '-ecf-dots';
  const barX = 8;
  const barWidth = WIDTH - 16;
  const icfWidth = barWidth * ICF_SHARE;

  /** One label from the source file, wrapped onto as many lines as it needs. */
  const text = (id: string, x: number, y: number, options: Omit<LabelProps, 'visual' | 'id' | 'x' | 'y'> = {}): ReactNode => (
    <Label visual={visual} id={id} x={x} y={y} {...options} />
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
        <pattern id={lines} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" className="fill-surface" />
          <line x1="0" y1="0" x2="0" y2="8" strokeWidth="2" className="stroke-highlight" />
        </pattern>
        <pattern id={dots} width="10" height="10" patternUnits="userSpaceOnUse">
          <rect width="10" height="10" className="fill-page" />
          <circle cx="5" cy="5" r="1.6" className="fill-highlight" />
        </pattern>
      </defs>

      {/* Step 1: all body fluid as one bar, 60% ICF and the rest ECF. */}
      <g data-depiction="two-compartments icf-larger">
        {text('icf-share', barX, 18, { size: 13, max: 18, soft: true })}
        <path
          d={`M${barX} 50 V43 H${barX + icfWidth} V50`}
          fill="none"
          strokeWidth="1.5"
          className="stroke-ink-soft"
        />
        <rect x={barX} y="54" width={icfWidth} height="48" fill={`url(#${lines})`} strokeWidth="1.5" className="stroke-ink" />
        <rect
          x={barX + icfWidth}
          y="54"
          width={barWidth - icfWidth}
          height="48"
          fill={`url(#${dots})`}
          strokeWidth="1.5"
          className="stroke-ink"
        />
        <g className="stroke-page" strokeWidth="5" paintOrder="stroke" strokeLinejoin="round">
          {text('icf-short', barX + icfWidth / 2, 84, { size: 17, anchor: 'middle', strong: true })}
          {text('ecf-short', barX + icfWidth + (barWidth - icfWidth) / 2, 84, { size: 17, anchor: 'middle', strong: true })}
        </g>
        {text('icf', barX, 128)}
        {text('ecf', WIDTH - barX, 150, { anchor: 'end' })}
      </g>

      {/* Step 2: inside the cells. */}
      {shown >= 2 && (
        <g data-depiction="icf-contents">
          <rect x="8" y="172" width={barWidth} height="186" rx="12" strokeWidth="1.5" className="fill-surface stroke-line" />
          <rect x="8" y="172" width="12" height="186" rx="6" fill={`url(#${lines})`} strokeWidth="1.5" className="stroke-ink" />
          {text('icf', 32, 198, { size: 16, strong: true })}
          {text('icf-electrolyte', 32, 221, { size: 14, soft: true })}
          <rect x="48" y="240" width="264" height="100" rx="40" strokeWidth="2" className="fill-page stroke-ink" />
          {text('icf-protein', 130, 282, { anchor: 'middle' })}
          {text('icf-water', 230, 282, { anchor: 'middle' })}
          {text('icf-electrolytes', 130, 312, { anchor: 'middle' })}
          {text('icf-solutes', 230, 312, { anchor: 'middle' })}
        </g>
      )}

      {/* Step 3: outside the cells. */}
      {shown >= 3 && (
        <g data-depiction="two-compartments">
          <rect x="8" y="374" width={barWidth} height="408" rx="12" strokeWidth="1.5" className="fill-page stroke-line" />
          <rect x="8" y="374" width="12" height="408" rx="6" fill={`url(#${dots})`} strokeWidth="1.5" className="stroke-ink" />
          {text('ecf', 32, 400, { size: 16, strong: true })}
          {text('ecf-electrolyte', 32, 423, { size: 14, soft: true })}
        </g>
      )}

      {/* Step 4: the ECF's three types. */}
      {shown >= 4 && (
        <g data-depiction="ecf-types">
          <g data-depiction="intravascular-blood">
            <rect x="32" y="442" width="304" height="112" rx="44" strokeWidth="2" className="fill-surface stroke-ink" />
            {text('intravascular', 184, 470, { anchor: 'middle', strong: true })}
            {text('blood-rbc', 112, 500, { size: 14, anchor: 'middle' })}
            {text('blood-wbc', 256, 500, { size: 14, anchor: 'middle' })}
            {text('blood-plasma', 112, 528, { size: 14, anchor: 'middle' })}
            {text('blood-platelets', 256, 528, { size: 14, anchor: 'middle' })}
          </g>
          <g data-depiction="interstitial-place">
            <rect x="40" y="574" width="280" height="64" fill={`url(#${dots})`} />
            <rect x="32" y="574" width="64" height="64" rx="16" strokeWidth="2" className="fill-surface stroke-ink" />
            <rect x="272" y="574" width="64" height="64" rx="16" strokeWidth="2" className="fill-surface stroke-ink" />
            <g className="stroke-page" strokeWidth="5" paintOrder="stroke" strokeLinejoin="round">
              {text('interstitial', 184, 611, { anchor: 'middle', strong: true })}
            </g>
          </g>
          <g data-depiction="transcellular-places">
            <rect
              x="32"
              y="658"
              width="304"
              height="108"
              rx="12"
              strokeWidth="1.5"
              strokeDasharray="6 4"
              className="fill-page stroke-ink"
            />
            {text('transcellular', 48, 684, { strong: true })}
            {text('area-cerebrospinal', 48, 714, { size: 14 })}
            {text('area-synovial', 236, 714, { size: 14 })}
            {text('area-gi', 48, 742, { size: 14 })}
            {text('area-intrapleural', 236, 742, { size: 14 })}
          </g>
        </g>
      )}
    </svg>
  );
}
