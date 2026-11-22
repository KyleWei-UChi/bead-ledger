import { useMemo, useState } from 'react';
import type { ColorForecast } from '../domain/forecast';
import { MARD_221, SERIES_LABELS, type Series } from '../palette/mard221';
import { hexFor } from '../lib/colors';
import { fmtDays, fmtQty, STATUS_META } from '../lib/format';
import { useAppStore } from '../store/useAppStore';

const SERIES_ORDER: Series[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'M'];

/**
 * The whole 221-colour palette as a map of your own stock.
 *
 * Each cell is the bead's real colour; its *state* is carried by a corner
 * marker and the hover card, never by tinting the bead itself — a recoloured
 * swatch would be worse than useless on a palette this close-toned.
 */
export function PaletteMap({
  forecasts,
  onSelect,
}: {
  forecasts: ColorForecast[];
  onSelect?: (code: string) => void;
}) {
  const { state } = useAppStore();
  const [hover, setHover] = useState<string | null>(null);

  const byCode = useMemo(
    () => new Map(forecasts.map((f) => [f.code, f])),
    [forecasts],
  );

  const active = hover ? byCode.get(hover) : undefined;
  const activeHex = hover ? hexFor(hover, state.colorMeta) : '#000';

  return (
    <div>
      <div className="space-y-3">
        {SERIES_ORDER.map((s) => {
          const colors = MARD_221.filter((c) => c.series === s);
          return (
            <div key={s}>
              <div className="mb-1 flex items-baseline gap-2">
                <span className="tnum text-xs font-semibold text-ink">{s}</span>
                <span className="text-xs text-ink-muted">{SERIES_LABELS[s]}</span>
                <span className="tnum ml-auto text-xs text-ink-muted">{colors.length}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {colors.map((c) => {
                  const f = byCode.get(c.code);
                  const status = f?.status;
                  const marker =
                    status === 'short' || status === 'order' || status === 'watch'
                      ? STATUS_META[status].token
                      : null;
                  const stocked = (f?.onHand ?? 0) > 0;
                  return (
                    <button
                      key={c.code}
                      type="button"
                      onMouseEnter={() => setHover(c.code)}
                      onMouseLeave={() => setHover(null)}
                      onFocus={() => setHover(c.code)}
                      onBlur={() => setHover(null)}
                      onClick={() => onSelect?.(c.code)}
                      aria-label={`${c.code}${
                        f ? `, ${fmtQty(f.available)} available, ${STATUS_META[f.status].label}` : ', not tracked'
                      }`}
                      className="swatch relative h-6 w-6 rounded-[3px] transition-transform hover:scale-125 hover:z-10"
                      style={{
                        background: hexFor(c.code, state.colorMeta),
                        // Desaturate rather than fade: on a dark surface a
                        // faded bead turns muddy brown and reads as a colour
                        // you own, which is exactly the wrong message.
                        filter: stocked || f ? 'none' : 'grayscale(1)',
                        opacity: stocked || f ? 1 : 0.35,
                      }}
                    >
                      {marker && (
                        <span
                          className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full"
                          style={{ background: marker, boxShadow: '0 0 0 1.5px var(--surface-1)' }}
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-hairline pt-3 text-xs text-ink-2">
        {(['short', 'order', 'watch'] as const).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: STATUS_META[s].token }} aria-hidden="true" />
            {STATUS_META[s].label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="swatch h-3 w-3 rounded-[2px] bg-ink-muted opacity-35" aria-hidden="true" />
          Not stocked
        </span>
      </div>

      {hover && (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-hairline bg-surface-2 p-2.5 text-sm">
          <span className="swatch h-8 w-8 shrink-0 rounded-md" style={{ background: activeHex }} aria-hidden="true" />
          <div className="min-w-0">
            <p className="tnum font-semibold">
              {hover}
              {state.colorMeta[hover]?.name ? ` · ${state.colorMeta[hover]?.name}` : ''}
              <span className="tnum ml-2 font-normal text-ink-muted">{activeHex}</span>
            </p>
            {active ? (
              <p className="tnum text-xs text-ink-2">
                <span style={{ color: STATUS_META[active.status].token }}>
                  {STATUS_META[active.status].icon} {STATUS_META[active.status].label}
                </span>
                {' · '}
                {fmtQty(active.available)} available
                {active.reserved > 0 && ` (${fmtQty(active.reserved)} reserved)`}
                {' · lasts '}
                {fmtDays(active.daysOfCover)}
              </p>
            ) : (
              <p className="text-xs text-ink-muted">Not tracked yet — add stock or use it in a blueprint.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
