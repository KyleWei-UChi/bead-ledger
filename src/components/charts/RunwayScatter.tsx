import { useState } from 'react';
import type { ColorForecast } from '../../domain/forecast';
import { fmtDays, fmtQty, fmtRate, STATUS_META } from '../../lib/format';
import { compact, useMeasure } from './chartUtils';

export interface RunwayPoint {
  f: ColorForecast;
  hex: string;
}

/**
 * The picture that explains why thresholds differ per colour: how fast you use
 * a colour (x) against how long it will last (y).
 *
 * Anything below the shaded band will run out before a replacement order could
 * arrive — that band is literally your lead time plus safety buffer, so the
 * chart and the reorder advice are the same rule drawn two ways.
 */
/** Round a max up to a readable axis top. */
function niceTicksLocal(max: number): number {
  const mag = 10 ** Math.floor(Math.log10(Math.max(max, 1)));
  const n = max / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

export function RunwayScatter({
  points,
  protectionDays,
  height = 260,
}: {
  points: RunwayPoint[];
  protectionDays: number;
  height?: number;
}) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);

  const live = points.filter((p) => p.f.burnRate > 0);
  const pad = { top: 14, right: 18, bottom: 38, left: 52 };
  const w = Math.max(width, 260);
  const innerW = Math.max(10, w - pad.left - pad.right);
  const innerH = Math.max(10, height - pad.top - pad.bottom);

  if (live.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-ink-2">
        Needs at least one finished blueprint before a runway can be estimated.
      </p>
    );
  }

  const maxRate = Math.max(...live.map((p) => p.f.burnRate * 7), 1);
  const xMax = niceTicksLocal(maxRate);
  const xTicks = [0, xMax / 4, xMax / 2, (xMax * 3) / 4, xMax];

  // Runway spans orders of magnitude — a colour with three weeks left and one
  // with four years both matter. On a linear axis everything interesting gets
  // crushed into the bottom few pixels, so the y axis is logarithmic.
  const LO = 7;
  const HI = 1095;
  const coverValues = live.map((p) => p.f.daysOfCover).filter(Number.isFinite);
  const maxCover = Math.min(HI, Math.max(...coverValues, protectionDays * 2, 90));
  const yLo = LO;
  const yHi = Math.max(maxCover * 1.15, protectionDays * 1.6, 60);

  const yTicks = [7, 14, 30, 60, 90, 180, 365, 730, 1095].filter(
    (t) => t >= yLo && t <= yHi,
  );

  const px = (ratePerWeek: number) => (ratePerWeek / xMax) * innerW;
  const py = (days: number) => {
    const d = Math.min(Math.max(days, yLo), yHi);
    const t = (Math.log(d) - Math.log(yLo)) / (Math.log(yHi) - Math.log(yLo));
    return innerH - t * innerH;
  };

  const bandTop = py(protectionDays);
  const active = live.find((p) => p.f.code === hover);

  return (
    <div ref={ref} className="relative w-full">
      <svg width={w} height={height} role="img" aria-label="Consumption rate against remaining runway">
        <g transform={`translate(${pad.left},${pad.top})`}>
          {/* The danger band: stock here cannot survive a replacement order. */}
          <rect
            x={0}
            y={bandTop}
            width={innerW}
            height={Math.max(0, innerH - bandTop)}
            fill="var(--critical)"
            opacity={0.07}
          />
          <line
            x1={0}
            x2={innerW}
            y1={bandTop}
            y2={bandTop}
            stroke="var(--critical)"
            strokeWidth={1.5}
            opacity={0.55}
          />
          <text x={4} y={bandTop - 5} fontSize={10.5} fill="var(--critical)">
            ▲ below {protectionDays}d — an order would not arrive in time
          </text>

          {yTicks.map((t) => (
            <g key={`y${t}`}>
              <line x1={0} x2={innerW} y1={py(t)} y2={py(t)} stroke="var(--grid)" strokeWidth={1} shapeRendering="crispEdges" />
              <text x={-8} y={py(t)} dy="0.32em" textAnchor="end" className="tnum" fontSize={11} fill="var(--ink-muted)">
                {t >= 365 ? `${(t / 365).toFixed(t % 365 === 0 ? 0 : 1)}y` : `${t}d`}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text
              key={`x${t}`}
              x={px(t)}
              y={innerH + 16}
              textAnchor="middle"
              className="tnum"
              fontSize={11}
              fill="var(--ink-muted)"
            >
              {compact(t)}
            </text>
          ))}

          <line x1={0} x2={innerW} y1={innerH} y2={innerH} stroke="var(--baseline)" strokeWidth={1} shapeRendering="crispEdges" />

          <text x={innerW} y={innerH + 32} textAnchor="end" fontSize={11} fill="var(--ink-2)">
            beads used per week →
          </text>
          <text
            transform={`translate(${-38},${innerH / 2}) rotate(-90)`}
            textAnchor="middle"
            fontSize={11}
            fill="var(--ink-2)"
          >
            days of cover (log)
          </text>

          {live
            .slice()
            .sort((a, b) => a.f.daysOfCover - b.f.daysOfCover)
            .map((p) => {
              const cx = px(p.f.burnRate * 7);
              const cy = py(p.f.daysOfCover);
              const urgent = p.f.status === 'short' || p.f.status === 'order';
              const atCeiling = p.f.daysOfCover > yHi;
              return (
                <g key={p.f.code}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={hover === p.f.code ? 8 : 6}
                    fill={p.hex}
                    opacity={atCeiling ? 0.55 : 1}
                    stroke={urgent ? 'var(--critical)' : 'var(--surface-1)'}
                    strokeWidth={2}
                    onMouseEnter={() => setHover(p.f.code)}
                    onMouseLeave={() => setHover(null)}
                    style={{ cursor: 'pointer' }}
                  />
                  {/* Only the colours in trouble are worth a permanent label. */}
                  {urgent && (
                    <text
                      x={cx + 10}
                      y={cy}
                      dy="0.32em"
                      className="tnum"
                      fontSize={10.5}
                      fill="var(--ink-2)"
                    >
                      {p.f.code}
                    </text>
                  )}
                </g>
              );
            })}
        </g>
      </svg>

      {active && (
        <div className="pointer-events-none absolute top-1 right-1 z-10 w-48 rounded-lg border border-hairline bg-surface p-2.5 text-xs shadow-xl">
          <p className="flex items-center gap-1.5 font-semibold text-ink">
            <span className="swatch h-3.5 w-3.5 rounded-[2px]" style={{ background: active.hex }} aria-hidden="true" />
            <span className="tnum">{active.f.code}</span>
            <span className="ml-auto" style={{ color: STATUS_META[active.f.status].token }}>
              {STATUS_META[active.f.status].icon} {STATUS_META[active.f.status].label}
            </span>
          </p>
          <dl className="mt-1.5 space-y-0.5 text-ink-2">
            <Row k="Available" v={fmtQty(active.f.available)} />
            <Row k="Using" v={fmtRate(active.f.burnRate)} />
            <Row k="Lasts" v={fmtDays(active.f.daysOfCover)} />
            <Row k="Reorder at" v={fmtQty(active.f.reorderPoint)} />
          </dl>
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt>{k}</dt>
      <dd className="tnum text-ink">{v}</dd>
    </div>
  );
}
