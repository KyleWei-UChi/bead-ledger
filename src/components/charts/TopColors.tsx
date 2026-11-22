import { fmtQty } from '../../lib/format';
import { compact } from './chartUtils';

export interface TopColorDatum {
  code: string;
  hex: string;
  qty: number;
  share: number;
}

/**
 * Which colours you actually burn through, ranked.
 *
 * The bars are filled with each bead's real colour because here the colour *is*
 * the identity — but every bar is also directly labelled with its code, so
 * nothing depends on telling two pale creams apart. A hairline ring keeps the
 * palest fills visible against the surface.
 */
export function TopColors({
  data,
  otherCount = 0,
  otherQty = 0,
}: {
  data: TopColorDatum[];
  otherCount?: number;
  otherQty?: number;
}) {
  const max = Math.max(...data.map((d) => d.qty), otherQty, 1);

  if (data.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-ink-2">
        Nothing consumed yet. Finish a blueprint and this fills in.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {data.map((d) => (
        <div key={d.code} className="flex items-center gap-2.5">
          <span className="tnum w-11 shrink-0 text-right text-xs font-medium text-ink-2">
            {d.code}
          </span>
          <div className="relative h-5 min-w-0 flex-1">
            <div
              className="swatch absolute inset-y-0 left-0 rounded-r-[4px]"
              style={{
                width: `${Math.max(1.5, (d.qty / max) * 100)}%`,
                background: d.hex,
              }}
            />
          </div>
          <span className="tnum w-14 shrink-0 text-right text-xs text-ink-2">
            {compact(d.qty)}
          </span>
          <span className="tnum w-10 shrink-0 text-right text-xs text-ink-muted">
            {(d.share * 100).toFixed(0)}%
          </span>
        </div>
      ))}

      {otherCount > 0 && (
        <div className="flex items-center gap-2.5 border-t border-hairline pt-2">
          <span className="w-11 shrink-0 text-right text-xs text-ink-muted">Other</span>
          <div className="relative h-5 min-w-0 flex-1">
            <div
              className="absolute inset-y-0 left-0 rounded-r-[4px]"
              style={{
                width: `${Math.max(1.5, (otherQty / max) * 100)}%`,
                background: 'var(--surface-2)',
                boxShadow: 'inset 0 0 0 1px var(--hairline)',
              }}
            />
          </div>
          <span className="tnum w-14 shrink-0 text-right text-xs text-ink-muted">
            {compact(otherQty)}
          </span>
          <span className="w-10 shrink-0 text-right text-xs text-ink-muted">
            {otherCount} cols
          </span>
        </div>
      )}
      <p className="pt-1 text-xs text-ink-muted">
        Total beads used per colour, all time. {fmtQty(data[0]?.qty ?? 0)} is your heaviest.
      </p>
    </div>
  );
}
