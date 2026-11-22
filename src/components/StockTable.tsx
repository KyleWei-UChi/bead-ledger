import { useEffect, useMemo, useState } from 'react';
import { setStock } from '../domain/actions';
import { byUrgency, forecastAll, monthlyConsumption, type ColorForecast, type StockStatus } from '../domain/forecast';
import { MARD_221, SERIES_LABELS, type Series } from '../palette/mard221';
import { hexFor } from '../lib/colors';
import { fmtDays, fmtQty, fmtRate, STATUS_META } from '../lib/format';
import { useAppStore } from '../store/useAppStore';
import { Sparkline } from './charts/Sparkline';
import { Button, Card } from './ui';

const SERIES_LIST: Series[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'M'];
const STATUSES: StockStatus[] = ['short', 'order', 'watch', 'ok', 'idle'];

type SortKey = 'urgency' | 'code' | 'available' | 'burn' | 'cover';

export function StockTable({ focusCode }: { focusCode?: string | null }) {
  const { state, update } = useAppStore();
  const [q, setQ] = useState('');
  const [series, setSeries] = useState<Series | 'all'>('all');
  const [status, setStatus] = useState<StockStatus | 'all'>('all');
  const [showAll, setShowAll] = useState(false);
  const [sort, setSort] = useState<SortKey>('urgency');

  useEffect(() => {
    if (focusCode) {
      setQ(focusCode);
      setShowAll(true);
    }
  }, [focusCode]);

  const forecasts = useMemo(() => forecastAll(state), [state]);
  const fByCode = useMemo(() => new Map(forecasts.map((f) => [f.code, f])), [forecasts]);

  const history = useMemo(() => {
    const months = monthlyConsumption(state.ledger, 8);
    const out = new Map<string, number[]>();
    for (const m of months) {
      for (const code of new Set([...m.byCode.keys()])) {
        if (!out.has(code)) out.set(code, []);
      }
    }
    for (const code of out.keys()) {
      out.set(code, months.map((m) => m.byCode.get(code) ?? 0));
    }
    return out;
  }, [state.ledger]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = MARD_221.filter((c) => {
      if (series !== 'all' && c.series !== series) return false;
      const f = fByCode.get(c.code);
      if (!showAll && !f) return false;
      if (status !== 'all' && (f?.status ?? 'idle') !== status) return false;
      if (!needle) return true;
      const name = state.colorMeta[c.code]?.name?.toLowerCase() ?? '';
      return c.code.toLowerCase().includes(needle) || name.includes(needle);
    });

    const withF = base.map((c) => ({ c, f: fByCode.get(c.code) }));
    const cmp: Record<SortKey, (a: typeof withF[0], b: typeof withF[0]) => number> = {
      code: (a, b) => a.c.code.localeCompare(b.c.code, undefined, { numeric: true }),
      available: (a, b) => (b.f?.available ?? 0) - (a.f?.available ?? 0),
      burn: (a, b) => (b.f?.burnRate ?? 0) - (a.f?.burnRate ?? 0),
      cover: (a, b) => (a.f?.daysOfCover ?? Infinity) - (b.f?.daysOfCover ?? Infinity),
      urgency: (a, b) =>
        a.f && b.f
          ? byUrgency(a.f, b.f)
          : a.f
            ? -1
            : b.f
              ? 1
              : a.c.code.localeCompare(b.c.code, undefined, { numeric: true }),
    };
    return withF.sort(cmp[sort]);
  }, [q, series, status, showAll, sort, fByCode, state.colorMeta]);

  const setName = (code: string, name: string) =>
    update((prev) => ({
      ...prev,
      colorMeta: { ...prev.colorMeta, [code]: { ...prev.colorMeta[code], name: name || undefined } },
      updatedAt: new Date().toISOString(),
    }));

  const counted = forecasts.length;

  return (
    <Card
      title="Stock"
      subtitle={`${counted} of 221 colours tracked. Type a new total to recount a colour — the difference is written to the ledger with today's date.`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          className="field min-w-[9rem] flex-1"
          placeholder="Search code or your name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search colours"
        />
        <select
          className="field"
          value={series}
          onChange={(e) => setSeries(e.target.value as Series | 'all')}
          aria-label="Series"
        >
          <option value="all">All series</option>
          {SERIES_LIST.map((s) => (
            <option key={s} value={s}>
              {s} — {SERIES_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          className="field"
          value={status}
          onChange={(e) => setStatus(e.target.value as StockStatus | 'all')}
          aria-label="Status"
        >
          <option value="all">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
            </option>
          ))}
        </select>
        <select
          className="field"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Sort by"
        >
          <option value="urgency">Sort: urgency</option>
          <option value="cover">Sort: runs out soonest</option>
          <option value="burn">Sort: used fastest</option>
          <option value="available">Sort: most available</option>
          <option value="code">Sort: code</option>
        </select>
        <Button onClick={() => setShowAll((v) => !v)} aria-pressed={showAll}>
          {showAll ? 'Tracked only' : 'Show all 221'}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-hairline">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="bg-surface-2 text-xs tracking-wide text-ink-2 uppercase">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Colour</th>
              <th className="px-3 py-2 text-left font-medium">Your name</th>
              <th className="px-3 py-2 text-right font-medium">On hand</th>
              <th className="px-3 py-2 text-right font-medium">Reserved</th>
              <th className="px-3 py-2 text-right font-medium">Available</th>
              <th className="px-3 py-2 text-right font-medium">Using</th>
              <th className="px-3 py-2 text-left font-medium">Last 8 mo</th>
              <th className="px-3 py-2 text-right font-medium">Lasts</th>
              <th className="px-3 py-2 text-right font-medium">Reorder at</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-ink-2">
                  Nothing matches those filters.
                </td>
              </tr>
            )}
            {rows.map(({ c, f }) => (
              <StockRow
                key={c.code}
                code={c.code}
                hex={hexFor(c.code, state.colorMeta)}
                f={f}
                name={state.colorMeta[c.code]?.name ?? ''}
                spark={history.get(c.code) ?? []}
                onName={(v) => setName(c.code, v)}
                onTotal={(total) => update((prev) => setStock(prev, c.code, total))}
              />
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-ink-muted">
        “Reorder at” is computed per colour from your own history: expected use over{' '}
        {state.settings.leadTimeDays + state.settings.safetyDays} days plus a safety buffer sized
        by how erratic that colour’s use has been. Tune it under Settings.
      </p>
    </Card>
  );
}

function StockRow({
  code,
  hex,
  f,
  name,
  spark,
  onName,
  onTotal,
}: {
  code: string;
  hex: string;
  f: ColorForecast | undefined;
  name: string;
  spark: number[];
  onName: (v: string) => void;
  onTotal: (total: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const onHand = f?.onHand ?? 0;
  const meta = STATUS_META[f?.status ?? 'idle'];

  const commit = () => {
    if (draft === null) return;
    const n = Number(draft);
    if (Number.isFinite(n) && n >= 0 && Math.round(n) !== onHand) onTotal(Math.round(n));
    setDraft(null);
  };

  return (
    <tr className="border-t border-hairline hover:bg-surface-2/50">
      <td className="px-3 py-1.5">
        <span className="inline-flex items-center gap-2">
          <span className="swatch h-5 w-5 shrink-0 rounded-[3px]" style={{ background: hex }} aria-hidden="true" />
          <span className="tnum font-medium">{code}</span>
        </span>
      </td>
      <td className="px-3 py-1.5">
        <input
          className="w-28 rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-hairline focus:border-hairline"
          value={name}
          placeholder="—"
          aria-label={`Your name for ${code}`}
          onChange={(e) => onName(e.target.value)}
        />
      </td>
      <td className="px-3 py-1.5 text-right">
        <input
          type="number"
          min={0}
          inputMode="numeric"
          className="tnum w-24 rounded border border-transparent bg-transparent px-1 py-0.5 text-right hover:border-hairline focus:border-hairline"
          value={draft ?? (onHand === 0 && !f ? '' : String(onHand))}
          placeholder="0"
          aria-label={`Beads of ${code} on hand`}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') setDraft(null);
          }}
        />
      </td>
      <td className="tnum px-3 py-1.5 text-right text-ink-2">
        {f && f.reserved > 0 ? fmtQty(f.reserved) : <span className="text-ink-muted">—</span>}
      </td>
      <td className="tnum px-3 py-1.5 text-right font-medium">
        {f ? (
          f.available < 0 ? (
            <span style={{ color: 'var(--critical)' }}>{fmtQty(f.available)}</span>
          ) : (
            fmtQty(f.available)
          )
        ) : (
          <span className="text-ink-muted">—</span>
        )}
      </td>
      <td className="tnum px-3 py-1.5 text-right text-ink-2">
        {f && f.burnRate > 0 ? fmtRate(f.burnRate) : <span className="text-ink-muted">—</span>}
      </td>
      <td className="px-3 py-1.5">
        {spark.some((v) => v > 0) ? <Sparkline values={spark} /> : <span className="text-xs text-ink-muted">—</span>}
      </td>
      <td className="tnum px-3 py-1.5 text-right text-ink-2">
        {f ? fmtDays(f.daysOfCover) : <span className="text-ink-muted">—</span>}
      </td>
      <td className="tnum px-3 py-1.5 text-right text-ink-2">
        {f && f.reorderPoint > 0 ? fmtQty(f.reorderPoint) : <span className="text-ink-muted">—</span>}
      </td>
      <td className="px-3 py-1.5">
        <span className="flex items-center gap-1 text-xs font-medium whitespace-nowrap" style={{ color: meta.token }} title={meta.help}>
          {meta.icon} {meta.label}
        </span>
      </td>
    </tr>
  );
}
