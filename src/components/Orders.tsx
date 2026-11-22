import { useMemo, useState } from 'react';
import { addRestock, deleteOrder } from '../domain/actions';
import { byUrgency, forecastAll, today } from '../domain/forecast';
import type { PlanLine } from '../domain/types';
import { hexFor } from '../lib/colors';
import { fmtDate, fmtQty } from '../lib/format';
import { useAppStore } from '../store/useAppStore';
import { LineEditor } from './LineEditor';
import { Button, Card, Empty, Field } from './ui';

/**
 * Supplement orders. Recording a delivery is the only thing that adds stock,
 * which keeps the ledger honest: every bead you have arrived on a date.
 */
export function Orders() {
  const { state, update } = useAppStore();
  const [lines, setLines] = useState<PlanLine[]>([]);
  const [date, setDate] = useState(today());
  const [vendor, setVendor] = useState('');
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);

  const suggested = useMemo(
    () =>
      forecastAll(state)
        .filter((f) => f.suggestedOrderQty > 0)
        .sort(byUrgency),
    [state],
  );

  const total = lines.reduce((a, l) => a + l.qty, 0);

  const record = () => {
    if (lines.length === 0) return;
    update((prev) => addRestock(prev, lines, { date, vendor, note }));
    setLines([]);
    setVendor('');
    setNote('');
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  };

  const history = state.orders.slice().sort((a, b) => b.placedOn.localeCompare(a.placedOn));

  return (
    <div className="space-y-5">
      <Card
        title="Record a delivery"
        subtitle="Add beads to your stock when a supplement order arrives."
        right={
          suggested.length > 0 && (
            <Button
              title="Includes colours merely getting close — while you are placing an order anyway, topping them up saves a second shipment."
              onClick={() =>
                setLines(suggested.map((f) => ({ code: f.code, qty: f.suggestedOrderQty })))
              }
            >
              Fill from suggestions ({suggested.length})
            </Button>
          )
        }
      >
        <div className="mb-4 grid gap-4 sm:grid-cols-3">
          <Field label="Arrived on">
            <input
              type="date"
              className="field w-full"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Seller">
            <input
              className="field w-full"
              value={vendor}
              placeholder="e.g. Taobao shop name"
              onChange={(e) => setVendor(e.target.value)}
            />
          </Field>
          <Field label="Note">
            <input
              className="field w-full"
              value={note}
              placeholder="Order number, cost, anything"
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </div>

        <LineEditor
          lines={lines}
          onChange={setLines}
          emptyHint="Add what arrived, or paste the packing list."
        />

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={record} disabled={lines.length === 0}>
            Add {fmtQty(total)} beads to stock
          </Button>
          {saved && (
            <span className="text-sm" style={{ color: 'var(--good)' }}>
              ✓ Stock updated
            </span>
          )}
        </div>
      </Card>

      <Card title="Order history" subtitle={`${history.length} recorded`}>
        {history.length === 0 ? (
          <Empty>No deliveries recorded yet.</Empty>
        ) : (
          <ul className="space-y-3">
            {history.map((o) => {
              const sum = o.lines.reduce((a, l) => a + l.qty, 0);
              return (
                <li key={o.id} className="rounded-lg border border-hairline bg-surface-2 p-3">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-medium">{fmtDate(o.arrivedOn ?? o.placedOn)}</span>
                    {o.vendor && <span className="text-sm text-ink-2">{o.vendor}</span>}
                    <span className="tnum text-sm text-ink-2">
                      {o.lines.length} colours · {fmtQty(sum)} beads
                    </span>
                    <button
                      type="button"
                      className="ml-auto text-xs text-ink-muted hover:text-ink"
                      onClick={() => update((prev) => deleteOrder(prev, o.id))}
                      title="Removes this delivery and its effect on your stock"
                    >
                      Remove
                    </button>
                  </div>
                  {o.note && <p className="mt-1 text-xs text-ink-muted">{o.note}</p>}
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                    {o.lines.map((l) => (
                      <span key={l.code} className="tnum flex items-center gap-1 text-xs text-ink-2">
                        <span
                          className="swatch h-3 w-3 rounded-[2px]"
                          style={{ background: hexFor(l.code, state.colorMeta) }}
                          aria-hidden="true"
                        />
                        {l.code} ×{fmtQty(l.qty)}
                      </span>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
