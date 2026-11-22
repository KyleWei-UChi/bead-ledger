import { useEffect, useMemo, useRef, useState } from 'react';
import { MARD_221, SERIES_LABELS, type Series } from '../palette/mard221';
import { hexFor } from '../lib/colors';
import { useAppStore } from '../store/useAppStore';

const SERIES: Series[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'M'];

/**
 * Searchable picker over the full 221-colour palette. Searches code and your
 * own colour names, and can be narrowed to a series when you are working
 * through one family of shades.
 */
export function CodePicker({
  value,
  onPick,
  placeholder = 'Add a colour…',
  exclude,
  autoFocus,
}: {
  value?: string;
  onPick: (code: string) => void;
  placeholder?: string;
  exclude?: Set<string>;
  autoFocus?: boolean;
}) {
  const { state } = useAppStore();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [series, setSeries] = useState<Series | 'all'>('all');
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return MARD_221.filter((c) => {
      if (series !== 'all' && c.series !== series) return false;
      if (exclude?.has(c.code)) return false;
      if (!needle) return true;
      const name = state.colorMeta[c.code]?.name?.toLowerCase() ?? '';
      return c.code.toLowerCase().includes(needle) || name.includes(needle);
    });
  }, [q, series, exclude, state.colorMeta]);

  const commit = (code: string) => {
    onPick(code);
    setQ('');
    setOpen(false);
  };

  return (
    <div ref={box} className="relative">
      <div className="field flex items-center gap-2">
        {value && (
          <span
            className="swatch h-4 w-4 shrink-0 rounded-[3px]"
            style={{ background: hexFor(value, state.colorMeta) }}
            aria-hidden="true"
          />
        )}
        <input
          className="tnum w-full min-w-0 bg-transparent outline-none"
          value={open ? q : (value ?? q)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          aria-label="Bead colour code"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches[0]) {
              e.preventDefault();
              commit(matches[0].code);
            }
          }}
        />
      </div>

      {open && (
        <div className="absolute left-0 z-30 mt-1 w-[min(26rem,85vw)] rounded-lg border border-hairline bg-surface shadow-xl">
          <div className="flex flex-wrap gap-1 border-b border-hairline p-2">
            <SeriesChip active={series === 'all'} onClick={() => setSeries('all')}>
              All 221
            </SeriesChip>
            {SERIES.map((s) => (
              <SeriesChip key={s} active={series === s} onClick={() => setSeries(s)}>
                {s}
              </SeriesChip>
            ))}
          </div>
          <div className="max-h-72 overflow-auto p-1.5">
            {matches.length === 0 && (
              <p className="p-3 text-sm text-ink-muted">No colour matches “{q}”.</p>
            )}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-1">
              {matches.map((c) => {
                const name = state.colorMeta[c.code]?.name;
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => commit(c.code)}
                    title={`${c.code}${name ? ` · ${name}` : ''} — ${SERIES_LABELS[c.series]}`}
                    className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm hover:bg-surface-2"
                  >
                    <span
                      className="swatch h-5 w-5 shrink-0 rounded-[3px]"
                      style={{ background: hexFor(c.code, state.colorMeta) }}
                      aria-hidden="true"
                    />
                    <span className="tnum truncate">{c.code}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SeriesChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
        active ? 'bg-accent text-white' : 'bg-surface-2 text-ink-2 hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}
