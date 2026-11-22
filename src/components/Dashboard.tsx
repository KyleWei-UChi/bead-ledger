import { useMemo } from 'react';
import { byUrgency, forecastAll, monthlyConsumption, today } from '../domain/forecast';
import { addDays } from '../domain/forecast';
import { hexFor } from '../lib/colors';
import { fmtDate, fmtQty, STATUS_META } from '../lib/format';
import { useAppStore } from '../store/useAppStore';
import { ConsumptionArea, type MonthPoint } from './charts/ConsumptionArea';
import { RunwayScatter } from './charts/RunwayScatter';
import { TopColors, type TopColorDatum } from './charts/TopColors';
import { PaletteMap } from './PaletteMap';
import { ReorderPanel } from './ReorderPanel';
import { Card, StatTile } from './ui';

const TOP_N = 12;

export function Dashboard({ onPickColor }: { onPickColor: (code: string) => void }) {
  const { state } = useAppStore();

  const forecasts = useMemo(() => forecastAll(state).sort(byUrgency), [state]);

  const totals = useMemo(() => {
    const onHand = forecasts.reduce((a, f) => a + Math.max(0, f.onHand), 0);
    const reserved = forecasts.reduce((a, f) => a + f.reserved, 0);
    const toOrder = forecasts.filter((f) => f.status === 'short' || f.status === 'order').length;
    const since = addDays(today(), -30);
    const last30 = state.ledger
      .filter((e) => e.kind === 'consume' && e.date >= since)
      .reduce((a, e) => a + Math.abs(e.delta), 0);
    const planned = state.blueprints.filter((b) => b.status === 'planned').length;
    const finished = state.blueprints.filter((b) => b.status === 'finished').length;
    const soonest = forecasts
      .filter((f) => Number.isFinite(f.daysOfCover) && f.available >= 0)
      .sort((a, b) => a.daysOfCover - b.daysOfCover)[0];
    return { onHand, reserved, toOrder, last30, planned, finished, soonest };
  }, [forecasts, state]);

  const months: MonthPoint[] = useMemo(() => {
    const raw = monthlyConsumption(state.ledger, 12);
    return raw.map((m) => ({
      month: m.month,
      total: m.total,
      top: [...m.byCode]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([code, qty]) => ({ code, qty, hex: hexFor(code, state.colorMeta) })),
    }));
  }, [state.ledger, state.colorMeta]);

  const { top, otherCount, otherQty } = useMemo(() => {
    const tally = new Map<string, number>();
    for (const e of state.ledger) {
      if (e.kind !== 'consume') continue;
      tally.set(e.code, (tally.get(e.code) ?? 0) + Math.abs(e.delta));
    }
    const all = [...tally].sort((a, b) => b[1] - a[1]);
    const grand = all.reduce((a, [, q]) => a + q, 0) || 1;
    const head: TopColorDatum[] = all.slice(0, TOP_N).map(([code, qty]) => ({
      code,
      qty,
      hex: hexFor(code, state.colorMeta),
      share: qty / grand,
    }));
    const tail = all.slice(TOP_N);
    return {
      top: head,
      otherCount: tail.length,
      otherQty: tail.reduce((a, [, q]) => a + q, 0),
    };
  }, [state.ledger, state.colorMeta]);

  const scatterPoints = useMemo(
    () => forecasts.map((f) => ({ f, hex: hexFor(f.code, state.colorMeta) })),
    [forecasts, state.colorMeta],
  );

  const protectionDays = state.settings.leadTimeDays + state.settings.safetyDays;
  const empty = state.ledger.length === 0 && state.blueprints.length === 0;

  if (empty) {
    return (
      <Card title="Nothing tracked yet">
        <div className="space-y-3 text-sm text-ink-2">
          <p>Three things to do, in this order:</p>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>
              Go to <strong className="text-ink">Stock</strong> and enter what you currently have.
              Rough counts are fine — you can recount any time.
            </li>
            <li>
              Add the blueprints you have already finished under{' '}
              <strong className="text-ink">Blueprints</strong>. This is what teaches the app how
              fast you use each colour.
            </li>
            <li>
              Queue up what you plan to build next. Those beads get reserved, so the warnings
              account for work you have not started.
            </li>
          </ol>
          <p>
            Reorder advice appears here once there is some consumption history to measure.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Beads on hand"
          value={fmtQty(totals.onHand)}
          note={totals.reserved > 0 ? `${fmtQty(totals.reserved)} reserved for queued work` : 'Nothing reserved'}
        />
        <StatTile
          label="Need ordering"
          value={totals.toOrder}
          tone={totals.toOrder > 0 ? 'var(--serious)' : 'var(--good)'}
          note={totals.toOrder > 0 ? 'See the order list below' : 'All colours comfortable'}
        />
        <StatTile
          label="Used last 30 days"
          value={fmtQty(totals.last30)}
          note={`${totals.finished} blueprint${totals.finished === 1 ? '' : 's'} finished all time`}
        />
        <StatTile
          label="First to run out"
          value={totals.soonest ? totals.soonest.code : '—'}
          note={
            totals.soonest?.runsOutOn
              ? `around ${fmtDate(totals.soonest.runsOutOn)}`
              : 'no consumption recorded yet'
          }
        />
      </div>

      <Card
        title="Order list"
        subtitle={`Thresholds are per colour: a colour you burn fast, or in unpredictable bursts, gets warned about earlier.`}
      >
        <ReorderPanel forecasts={forecasts} />
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Beads used per month" subtitle="All colours combined, last 12 months">
          <ConsumptionArea data={months} />
        </Card>

        <Card title="Where your beads go" subtitle={`Heaviest ${Math.min(TOP_N, top.length)} colours, all time`}>
          <TopColors data={top} otherCount={otherCount} otherQty={otherQty} />
        </Card>
      </div>

      <Card
        title="Consumption rate against runway"
        subtitle="Each dot is a colour. Dots in the red band will run out before a replacement order could land."
      >
        <RunwayScatter points={scatterPoints} protectionDays={protectionDays} />
      </Card>

      <Card
        title="Your palette at a glance"
        subtitle="All 221 MARD colours. Faded means you have never stocked or used it. Click to inspect."
      >
        <PaletteMap forecasts={forecasts} onSelect={onPickColor} />
      </Card>

      <p className="pb-2 text-center text-xs text-ink-muted">
        Legend —{' '}
        {(['short', 'order', 'watch', 'ok', 'idle'] as const).map((s, i) => (
          <span key={s}>
            {i > 0 && ' · '}
            <span style={{ color: STATUS_META[s].token }}>
              {STATUS_META[s].icon} {STATUS_META[s].label}
            </span>
          </span>
        ))}
      </p>
    </div>
  );
}
