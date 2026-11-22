import { useMemo, useState } from 'react';
import { finishBlueprint, prefillActual } from '../domain/actions';
import { forecastAll, today } from '../domain/forecast';
import { substitutionHistory } from '../domain/inventory';
import type { Blueprint, PlanLine, Substitution } from '../domain/types';
import { hexFor } from '../lib/colors';
import { fmtQty } from '../lib/format';
import { useAppStore } from '../store/useAppStore';
import { CodePicker } from './CodePicker';
import { LineEditor } from './LineEditor';
import { Button, Field, Modal } from './ui';

/**
 * Log what a blueprint actually cost you.
 *
 * Starts from the chart's legend because that is usually nearly right, then
 * gets out of the way: change the counts you deviated on, and use "swap" when
 * you reached for a different colour entirely. Swaps are recorded as their own
 * fact, so later you can see that you keep substituting E5 for E4.
 */
export function FinishDialog({ bp, onClose }: { bp: Blueprint; onClose: () => void }) {
  const { state, update } = useAppStore();
  const [actual, setActual] = useState<PlanLine[]>(() => prefillActual(bp));
  const [subs, setSubs] = useState<Substitution[]>(bp.substitutions ?? []);
  const [date, setDate] = useState(bp.finishedOn ?? today());
  const [notes, setNotes] = useState(bp.notes ?? '');
  const [swapping, setSwapping] = useState<string | null>(null);

  const available = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of forecastAll(state)) {
      // This blueprint's own reservation is about to be consumed, so add it back.
      const own = bp.status === 'planned' ? (bp.plan.find((l) => l.code === f.code)?.qty ?? 0) : 0;
      m.set(f.code, f.available + own);
    }
    for (const l of actual) if (!m.has(l.code)) m.set(l.code, 0);
    return m;
  }, [state, actual, bp]);

  const suggestions = useMemo(() => substitutionHistory(state.blueprints), [state.blueprints]);

  const doSwap = (fromCode: string, toCode: string) => {
    if (fromCode === toCode) {
      setSwapping(null);
      return;
    }
    const row = actual.find((l) => l.code === fromCode);
    const qty = row?.qty ?? 0;

    // If this row already came from a swap, retarget that record rather than
    // chaining A->B->C, which would invent a substitution you never made.
    const existing = subs.find((s) => s.usedCode === fromCode);
    if (existing) {
      setSubs(
        subs.map((s) =>
          s === existing
            ? s.plannedCode === toCode
              ? s // swapped back to the original: drop it below
              : { ...s, usedCode: toCode, qty }
            : s,
        ).filter((s) => s.plannedCode !== s.usedCode),
      );
    } else {
      setSubs([...subs, { plannedCode: fromCode, usedCode: toCode, qty }]);
    }

    setActual((prev) => {
      const merged = new Map(prev.filter((l) => l.code !== fromCode).map((l) => [l.code, l.qty]));
      merged.set(toCode, (merged.get(toCode) ?? 0) + qty);
      return [...merged].map(([code, q]) => ({ code, qty: q }));
    });
    setSwapping(null);
  };

  const commit = () => {
    // Keep only swaps whose target is still in the final list.
    const live = subs.filter(
      (s) => actual.some((l) => l.code === s.usedCode) && s.plannedCode !== s.usedCode,
    );
    update((prev) =>
      finishBlueprint(prev, bp.id, {
        actual,
        substitutions: live.map((s) => ({
          ...s,
          qty: actual.find((l) => l.code === s.usedCode)?.qty ?? s.qty,
        })),
        finishedOn: date,
        notes,
      }),
    );
    onClose();
  };

  const planTotal = bp.plan.reduce((a, l) => a + l.qty, 0);
  const actualTotal = actual.reduce((a, l) => a + l.qty, 0);
  const diff = actualTotal - planTotal;

  return (
    <Modal
      wide
      title={`Finished: ${bp.title}`}
      subtitle="Adjust anything you used differently, then save. These counts come off your stock."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={commit} disabled={actual.length === 0}>
            Save and deduct {fmtQty(actualTotal)} beads
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Finished on">
            <input
              type="date"
              className="field w-full"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <div className="rounded-lg border border-hairline bg-surface-2 p-2.5 text-sm">
            <p className="tnum text-ink-2">
              Chart called for <span className="font-semibold text-ink">{fmtQty(planTotal)}</span>
            </p>
            <p className="tnum text-ink-2">
              You used <span className="font-semibold text-ink">{fmtQty(actualTotal)}</span>
              {diff !== 0 && (
                <span className={diff > 0 ? '' : 'text-ink-muted'}>
                  {' '}
                  ({diff > 0 ? '+' : ''}
                  {fmtQty(diff)})
                </span>
              )}
            </p>
          </div>
        </div>

        <div>
          <span className="mb-1 block text-xs font-medium tracking-wide text-ink-2 uppercase">
            Beads actually used
          </span>
          <LineEditor
            lines={actual}
            onChange={setActual}
            available={available}
            emptyHint="Nothing listed — add the colours you used."
            rowExtra={(line) => (
              <div className="relative">
                {swapping === line.code ? (
                  <div className="w-44">
                    <CodePicker
                      autoFocus
                      placeholder="Used instead…"
                      onPick={(code) => doSwap(line.code, code)}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      className="rounded border border-hairline px-1.5 py-0.5 text-xs text-ink-2 hover:text-ink"
                      onClick={() => setSwapping(line.code)}
                    >
                      swap
                    </button>
                    {suggestions.get(line.code)?.slice(0, 1).map((s) => (
                      <button
                        key={s.usedCode}
                        type="button"
                        title={`You have used ${s.usedCode} instead of ${line.code} ${s.times} time(s)`}
                        className="tnum flex items-center gap-1 rounded border border-dashed border-hairline px-1.5 py-0.5 text-xs text-ink-muted hover:text-ink"
                        onClick={() => doSwap(line.code, s.usedCode)}
                      >
                        <span
                          className="swatch h-3 w-3 rounded-[2px]"
                          style={{ background: hexFor(s.usedCode, state.colorMeta) }}
                          aria-hidden="true"
                        />
                        {s.usedCode}?
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          />
        </div>

        {subs.length > 0 && (
          <div className="rounded-lg border p-2.5" style={{ borderColor: 'var(--accent)' }}>
            <p className="mb-1.5 text-xs font-medium tracking-wide uppercase" style={{ color: 'var(--accent)' }}>
              Substitutions recorded
            </p>
            <ul className="space-y-1 text-sm">
              {subs.map((s, i) => (
                <li key={`${s.plannedCode}-${s.usedCode}-${i}`} className="flex items-center gap-2">
                  <span className="swatch h-4 w-4 rounded-[2px]" style={{ background: hexFor(s.plannedCode, state.colorMeta) }} aria-hidden="true" />
                  <span className="tnum text-ink-muted line-through">{s.plannedCode}</span>
                  <span className="text-ink-muted">→</span>
                  <span className="swatch h-4 w-4 rounded-[2px]" style={{ background: hexFor(s.usedCode, state.colorMeta) }} aria-hidden="true" />
                  <span className="tnum font-medium">{s.usedCode}</span>
                  <span className="tnum ml-auto text-xs text-ink-2">
                    {fmtQty(actual.find((l) => l.code === s.usedCode)?.qty ?? s.qty)} beads
                  </span>
                  <button
                    type="button"
                    aria-label={`Undo swap ${s.plannedCode} to ${s.usedCode}`}
                    className="text-xs text-ink-muted hover:text-ink"
                    onClick={() => doSwap(s.usedCode, s.plannedCode)}
                  >
                    undo
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Field label="Notes">
          <textarea
            className="field h-16 w-full"
            value={notes}
            placeholder="How it turned out, what you'd change…"
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
