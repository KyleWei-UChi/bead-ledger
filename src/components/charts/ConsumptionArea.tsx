import { useState } from 'react';
import { compact, monthLabel, monthLabelLong, niceTicks, useMeasure } from './chartUtils';
import { fmtQty } from '../../lib/format';

export interface MonthPoint {
  month: string;
  total: number;
  top: { code: string; hex: string; qty: number }[];
}

/**
 * Total beads consumed per month — one series, so no legend is needed: the
 * title names it. Hover gives a crosshair, the month's total, and which
 * colours dominated it.
 */
export function ConsumptionArea({
  data,
  height = 190,
  lastIsPartial = true,
}: {
  data: MonthPoint[];
  height?: number;
  /** The final bucket is the month in progress, so its dip is not a real drop. */
  lastIsPartial?: boolean;
}) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const pad = { top: 12, right: 14, bottom: 26, left: 44 };
  const w = Math.max(width, 240);
  const innerW = Math.max(10, w - pad.left - pad.right);
  const innerH = Math.max(10, height - pad.top - pad.bottom);

  const max = Math.max(...data.map((d) => d.total), 1);
  const ticks = niceTicks(max, 4);
  const yMax = ticks[ticks.length - 1] ?? max;

  const x = (i: number) => (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v: number) => innerH - (v / yMax) * innerH;

  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.total).toFixed(1)}`).join(' ');
  const area = data.length
    ? `${line} L${x(data.length - 1).toFixed(1)},${innerH} L${x(0).toFixed(1)},${innerH} Z`
    : '';

  const nearest = (clientX: number, rect: DOMRect) => {
    const px = clientX - rect.left - pad.left;
    if (data.length < 2) return 0;
    return Math.max(0, Math.min(data.length - 1, Math.round((px / innerW) * (data.length - 1))));
  };

  const active = hover === null ? null : data[hover];
  // Label every other month on narrow viewports so ticks never collide.
  const labelEvery = innerW / data.length < 34 ? 2 : 1;

  return (
    <div ref={ref} className="relative w-full">
      <svg
        width={w}
        height={height}
        role="img"
        aria-label="Beads consumed per month"
        onMouseMove={(e) => setHover(nearest(e.clientX, e.currentTarget.getBoundingClientRect()))}
        onMouseLeave={() => setHover(null)}
      >
        <g transform={`translate(${pad.left},${pad.top})`}>
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={0}
                x2={innerW}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--grid)"
                strokeWidth={1}
                shapeRendering="crispEdges"
              />
              <text
                x={-8}
                y={y(t)}
                dy="0.32em"
                textAnchor="end"
                className="tnum"
                fontSize={11}
                fill="var(--ink-muted)"
              >
                {compact(t)}
              </text>
            </g>
          ))}

          {area && <path d={area} fill="var(--accent)" opacity={0.16} />}
          {line && (
            <path
              d={line}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {hover !== null && data[hover] && (
            <g>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={0}
                y2={innerH}
                stroke="var(--baseline)"
                strokeWidth={1}
              />
              <circle
                cx={x(hover)}
                cy={y(data[hover]!.total)}
                r={4.5}
                fill="var(--accent)"
                stroke="var(--surface-1)"
                strokeWidth={2}
              />
            </g>
          )}

          {/* The month in progress is drawn hollow: its total is incomplete,
              and a solid point would read as a collapse in consumption. */}
          {lastIsPartial && data.length > 0 && (
            <circle
              cx={x(data.length - 1)}
              cy={y(data[data.length - 1]!.total)}
              r={4}
              fill="var(--surface-1)"
              stroke="var(--accent)"
              strokeWidth={2}
            />
          )}

          <line
            x1={0}
            x2={innerW}
            y1={innerH}
            y2={innerH}
            stroke="var(--baseline)"
            strokeWidth={1}
            shapeRendering="crispEdges"
          />

          {data.map((d, i) =>
            i % labelEvery === 0 ? (
              <text
                key={d.month}
                x={x(i)}
                y={innerH + 16}
                textAnchor="middle"
                fontSize={11}
                fill="var(--ink-muted)"
              >
                {monthLabel(d.month)}
              </text>
            ) : null,
          )}
        </g>
      </svg>

      {lastIsPartial && data.length > 0 && (
        <p className="mt-1 text-xs text-ink-muted">
          The hollow point is {monthLabelLong(data[data.length - 1]!.month)}, still in progress.
        </p>
      )}

      {active && (
        <div
          className="pointer-events-none absolute top-1 z-10 w-44 rounded-lg border border-hairline bg-surface p-2.5 text-xs shadow-xl"
          style={{
            left: Math.min(
              Math.max(pad.left + x(hover!) - 88, 0),
              Math.max(0, w - 176),
            ),
          }}
        >
          <p className="font-semibold text-ink">{monthLabelLong(active.month)}</p>
          <p className="tnum mt-0.5 text-ink-2">{fmtQty(active.total)} beads used</p>
          {active.top.length > 0 && (
            <ul className="mt-1.5 space-y-1">
              {active.top.map((t) => (
                <li key={t.code} className="flex items-center gap-1.5">
                  <span
                    className="swatch h-3 w-3 shrink-0 rounded-[2px]"
                    style={{ background: t.hex }}
                    aria-hidden="true"
                  />
                  <span className="tnum text-ink-2">{t.code}</span>
                  <span className="tnum ml-auto text-ink-muted">{fmtQty(t.qty)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
