import { useMemo, useState } from 'react';
import type { ColorForecast } from '../domain/forecast';
import { hexFor } from '../lib/colors';
import { fmtDate, fmtDays, fmtQty, fmtRate, STATUS_META } from '../lib/format';
import { useAppStore } from '../store/useAppStore';
import { Button, Empty } from './ui';

/**
 * The thing you actually act on: what to buy, how much, and by when.
 *
 * The bar is a status bar, not a bead colour — urgency and identity are
 * deliberately on different channels, with the bead's own swatch beside the
 * code for identity and an icon + word beside the colour for state.
 */
export function ReorderPanel({ forecasts }: { forecasts: ColorForecast[] }) {
  const { state } = useAppStore();
  const [copied, setCopied] = useState(false);

  const needed = useMemo(
    () => forecasts.filter((f) => f.status === 'short' || f.status === 'order'),
    [forecasts],
  );
  const watching = useMemo(() => forecasts.filter((f) => f.status === 'watch'), [forecasts]);

  const orderText = needed
    .map((f) => `${f.code} x${f.suggestedOrderQty}`)
    .join('\n');

  const totalBeads = needed.reduce((a, f) => a + f.suggestedOrderQty, 0);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(orderText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  if (needed.length === 0) {
    return (
      <div>
        <Empty>
          <p className="font-medium" style={{ color: 'var(--good)' }}>
            ✓ Nothing needs ordering
          </p>
          <p className="mt-1">
            Every tracked colour is above its reorder point for a{' '}
            {state.settings.leadTimeDays}-day shipping time.
          </p>
        </Empty>
        {watching.length > 0 && <WatchStrip list={watching} />}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-2">
          <span className="font-semibold text-ink">{needed.length}</span> colour
          {needed.length === 1 ? '' : 's'} to order ·{' '}
          <span className="tnum">{fmtQty(totalBeads)}</span> beads suggested
        </p>
        <Button variant="primary" onClick={copy}>
          {copied ? '✓ Copied' : 'Copy order list'}
        </Button>
      </div>

      <ul className="space-y-2">
        {needed.map((f) => {
          const meta = STATUS_META[f.status];
          const hex = hexFor(f.code, state.colorMeta);
          // Bar length shows how deep into the threshold you are.
          const depth =
            f.reorderPoint > 0
              ? Math.max(0.04, Math.min(1, 1 - f.available / f.reorderPoint))
              : 1;
          return (
            <li key={f.code} className="rounded-lg border border-hairline bg-surface-2 p-2.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span
                  className="swatch h-6 w-6 shrink-0 rounded-[4px]"
                  style={{ background: hex }}
                  aria-hidden="true"
                />
                <span className="tnum min-w-[3rem] font-semibold">{f.code}</span>
                {state.colorMeta[f.code]?.name && (
                  <span className="text-xs text-ink-muted">{state.colorMeta[f.code]?.name}</span>
                )}
                <span
                  className="flex items-center gap-1 text-xs font-medium"
                  style={{ color: meta.token }}
                >
                  {meta.icon} {meta.label}
                </span>
                <span className="tnum ml-auto text-sm">
                  buy <span className="font-semibold">{fmtQty(f.suggestedOrderQty)}</span>
                </span>
              </div>

              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${depth * 100}%`, background: meta.token }}
                />
              </div>

              <dl className="tnum mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-ink-2 sm:grid-cols-4">
                <Pair k="Available" v={fmtQty(f.available)} />
                <Pair k="Reorder at" v={fmtQty(f.reorderPoint)} />
                <Pair k="Using" v={fmtRate(f.burnRate)} />
                <Pair
                  k={f.available < 0 ? 'Shortfall' : 'Runs out'}
                  v={
                    f.available < 0
                      ? fmtQty(-f.available)
                      : f.runsOutOn
                        ? fmtDate(f.runsOutOn)
                        : fmtDays(f.daysOfCover)
                  }
                />
              </dl>

              {f.reserved > 0 && (
                <p className="mt-1.5 text-xs text-ink-muted">
                  {fmtQty(f.reserved)} of your {fmtQty(f.onHand)} on hand is already promised to
                  queued blueprints.
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-xs text-ink-muted">
        Quantities cover your {state.settings.leadTimeDays}-day shipping time plus{' '}
        {state.settings.safetyDays} days of buffer, then about{' '}
        {state.settings.targetCoverDays} days of use, rounded up to{' '}
        {state.settings.packSize}-bead packs.
      </p>

      {watching.length > 0 && <WatchStrip list={watching} />}
    </div>
  );
}

function WatchStrip({ list }: { list: ColorForecast[] }) {
  const { state } = useAppStore();
  return (
    <div className="mt-4 border-t border-hairline pt-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--warning)' }}>
        ◐ Getting close ({list.length})
      </p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
        {list.slice(0, 14).map((f) => (
          <li key={f.code} className="flex items-center gap-1.5 text-xs text-ink-2">
            <span
              className="swatch h-3.5 w-3.5 rounded-[2px]"
              style={{ background: hexFor(f.code, state.colorMeta) }}
              aria-hidden="true"
            />
            <span className="tnum font-medium text-ink">{f.code}</span>
            <span className="tnum">{fmtDays(f.daysOfCover)}</span>
          </li>
        ))}
        {list.length > 14 && <li className="text-xs text-ink-muted">+{list.length - 14} more</li>}
      </ul>
    </div>
  );
}

function Pair({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-ink-muted">{k}</dt>
      <dd className="text-ink">{v}</dd>
    </div>
  );
}
