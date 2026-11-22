import { useMemo, useState } from 'react';
import { parseLegend } from '../domain/actions';
import type { PlanLine } from '../domain/types';
import { fmtQty } from '../lib/format';
import { hexFor } from '../lib/colors';
import { useAppStore } from '../store/useAppStore';
import { CodePicker } from './CodePicker';
import { Button } from './ui';

export interface LineEditorProps {
  lines: PlanLine[];
  onChange: (lines: PlanLine[]) => void;
  /** Per-code availability, shown inline so shortfalls are visible as you type. */
  available?: Map<string, number>;
  /** Extra cell rendered at the end of each row, e.g. the substitution control. */
  rowExtra?: (line: PlanLine, index: number) => React.ReactNode;
  emptyHint?: string;
}

/**
 * The main data-entry surface, used for blueprint legends, finished counts and
 * restock orders alike. Typing 40 rows by hand is the slow part of this hobby,
 * so pasting a chart's legend is a first-class path.
 */
export function LineEditor({
  lines,
  onChange,
  available,
  rowExtra,
  emptyHint = 'No colours yet.',
}: LineEditorProps) {
  const { state } = useAppStore();
  const [pasting, setPasting] = useState(false);
  const [raw, setRaw] = useState('');
  const [report, setReport] = useState<{ unknown: string[]; skipped: string[] } | null>(null);

  const used = useMemo(() => new Set(lines.map((l) => l.code)), [lines]);
  const total = lines.reduce((a, l) => a + l.qty, 0);

  const setQty = (code: string, qty: number) =>
    onChange(lines.map((l) => (l.code === code ? { ...l, qty } : l)));

  const applyPaste = (mode: 'replace' | 'merge') => {
    const { lines: parsed, unknownCodes, skipped } = parseLegend(raw);
    if (parsed.length === 0) {
      setReport({ unknown: unknownCodes, skipped });
      return;
    }
    if (mode === 'replace') {
      onChange(parsed);
    } else {
      const merged = new Map(lines.map((l) => [l.code, l.qty]));
      for (const l of parsed) merged.set(l.code, (merged.get(l.code) ?? 0) + l.qty);
      onChange([...merged].map(([code, qty]) => ({ code, qty })));
    }
    setReport({ unknown: unknownCodes, skipped });
    setRaw('');
    setPasting(false);
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="min-w-[12rem] flex-1">
          <CodePicker
            onPick={(code) => {
              if (used.has(code)) return;
              onChange([...lines, { code, qty: 0 }]);
            }}
            exclude={used}
            placeholder="Add a colour…"
          />
        </div>
        <Button type="button" onClick={() => setPasting((v) => !v)}>
          {pasting ? 'Close paste' : 'Paste legend'}
        </Button>
        {lines.length > 0 && (
          <Button type="button" variant="ghost" onClick={() => onChange([])}>
            Clear all
          </Button>
        )}
      </div>

      {pasting && (
        <div className="mb-3 rounded-lg border border-hairline bg-surface-2 p-3">
          <p className="mb-2 text-sm text-ink-2">
            Paste the legend straight off your chart. Understands{' '}
            <code className="tnum">A1 120</code>, <code className="tnum">A1 x120</code>,{' '}
            <code className="tnum">A1: 120</code>, <code className="tnum">120 A1</code>, and
            several pairs per line.
          </p>
          <textarea
            className="field tnum h-32 w-full font-mono text-sm"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={'A1 120\nB3 x44\nH1: 208'}
            aria-label="Legend text"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" variant="primary" onClick={() => applyPaste('replace')}>
              Replace list
            </Button>
            <Button type="button" onClick={() => applyPaste('merge')}>
              Add to list
            </Button>
          </div>
        </div>
      )}

      {report && (report.unknown.length > 0 || report.skipped.length > 0) && (
        <div
          className="mb-3 rounded-lg border p-3 text-sm"
          style={{ borderColor: 'var(--warning)' }}
        >
          <p className="font-medium" style={{ color: 'var(--warning)' }}>
            ◐ Some of that paste was not used
          </p>
          {report.unknown.length > 0 && (
            <p className="mt-1 text-ink-2">
              Not in the MARD 221 palette:{' '}
              <span className="tnum">{report.unknown.join(', ')}</span>
            </p>
          )}
          {report.skipped.length > 0 && (
            <p className="mt-1 text-ink-2">
              Could not read {report.skipped.length} line
              {report.skipped.length === 1 ? '' : 's'}:{' '}
              <span className="tnum">{report.skipped.slice(0, 4).join(' · ')}</span>
              {report.skipped.length > 4 && ' …'}
            </p>
          )}
          <button
            type="button"
            className="mt-1.5 text-xs text-ink-muted underline"
            onClick={() => setReport(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {lines.length === 0 ? (
        <p className="rounded-lg border border-dashed border-hairline p-5 text-center text-sm text-ink-2">
          {emptyHint}
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-hairline">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs tracking-wide text-ink-2 uppercase">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Colour</th>
                <th className="px-3 py-2 text-right font-medium">Beads</th>
                {available && <th className="px-3 py-2 text-right font-medium">You have</th>}
                {rowExtra && <th className="px-3 py-2 text-left font-medium">Swap</th>}
                <th className="w-10 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const have = available?.get(l.code);
                const shortBy = have === undefined ? 0 : l.qty - have;
                return (
                  <tr key={l.code} className="border-t border-hairline">
                    <td className="px-3 py-1.5">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="swatch h-4.5 w-4.5 shrink-0 rounded-[3px]"
                          style={{ background: hexFor(l.code, state.colorMeta) }}
                          aria-hidden="true"
                        />
                        <span className="tnum font-medium">{l.code}</span>
                        {state.colorMeta[l.code]?.name && (
                          <span className="truncate text-xs text-ink-muted">
                            {state.colorMeta[l.code]?.name}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        className="field tnum w-24 text-right"
                        value={l.qty === 0 ? '' : l.qty}
                        placeholder="0"
                        aria-label={`Beads of ${l.code}`}
                        onChange={(e) => setQty(l.code, Math.max(0, Number(e.target.value) || 0))}
                      />
                    </td>
                    {available && (
                      <td className="tnum px-3 py-1.5 text-right">
                        {have === undefined ? (
                          <span className="text-ink-muted">—</span>
                        ) : shortBy > 0 ? (
                          <span style={{ color: 'var(--critical)' }}>
                            ▲ {fmtQty(have)}{' '}
                            <span className="text-xs">(short {fmtQty(shortBy)})</span>
                          </span>
                        ) : (
                          <span className="text-ink-2">{fmtQty(have)}</span>
                        )}
                      </td>
                    )}
                    {rowExtra && <td className="px-3 py-1.5">{rowExtra(l, i)}</td>}
                    <td className="px-2 py-1.5 text-right">
                      <button
                        type="button"
                        aria-label={`Remove ${l.code}`}
                        className="rounded px-1.5 py-0.5 text-ink-muted hover:text-ink"
                        onClick={() => onChange(lines.filter((x) => x.code !== l.code))}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t border-hairline bg-surface-2 text-ink-2">
              <tr>
                <td className="px-3 py-2 text-xs tracking-wide uppercase">
                  {lines.length} colour{lines.length === 1 ? '' : 's'}
                </td>
                <td className="tnum px-3 py-2 text-right font-semibold text-ink">
                  {fmtQty(total)}
                </td>
                {available && <td />}
                {rowExtra && <td />}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
