import { useMemo, useState } from 'react';
import { deleteBlueprint, unfinishBlueprint } from '../domain/actions';
import { forecastAll } from '../domain/forecast';
import { effectiveLines, substitutionHistory } from '../domain/inventory';
import type { Blueprint } from '../domain/types';
import { hexFor } from '../lib/colors';
import { fmtDate, fmtQty } from '../lib/format';
import { useAppStore } from '../store/useAppStore';
import { BlueprintEditor } from './BlueprintEditor';
import { FinishDialog } from './FinishDialog';
import { Button, Card, Empty } from './ui';

export function Blueprints() {
  const { state, update } = useAppStore();
  const [editing, setEditing] = useState<Blueprint | null>(null);
  const [adding, setAdding] = useState<'planned' | 'finished' | null>(null);
  const [finishing, setFinishing] = useState<Blueprint | null>(null);

  const planned = state.blueprints.filter((b) => b.status === 'planned');
  const finished = state.blueprints
    .filter((b) => b.status === 'finished')
    .sort((a, b) => (b.finishedOn ?? '').localeCompare(a.finishedOn ?? ''));

  const shortByCode = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of forecastAll(state)) if (f.available < 0) m.set(f.code, -f.available);
    return m;
  }, [state]);

  const swapStats = useMemo(() => {
    const h = substitutionHistory(state.blueprints);
    return [...h]
      .flatMap(([planned_, uses]) => uses.map((u) => ({ planned: planned_, ...u })))
      .sort((a, b) => b.times - a.times)
      .slice(0, 8);
  }, [state.blueprints]);

  return (
    <div className="space-y-5">
      <Card
        title="Up next"
        subtitle="Beads for these are reserved, so the order list already accounts for them."
        right={
          <Button variant="primary" onClick={() => setAdding('planned')}>
            + Blueprint
          </Button>
        }
      >
        {planned.length === 0 ? (
          <Empty>
            Nothing queued. Add a blueprint you intend to build and its beads get set aside.
          </Empty>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {planned.map((bp) => (
              <BlueprintCard
                key={bp.id}
                bp={bp}
                shortByCode={shortByCode}
                onEdit={() => setEditing(bp)}
                onFinish={() => setFinishing(bp)}
                onDelete={() => update((prev) => deleteBlueprint(prev, bp.id))}
              />
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="Finished"
        subtitle={`${finished.length} built. These are what the forecast learns from.`}
        right={
          <Button onClick={() => setAdding('finished')}>+ Log a past build</Button>
        }
      >
        {finished.length === 0 ? (
          <Empty>
            Nothing logged yet. Adding past builds is the fastest way to get useful reorder
            advice — the app needs history to estimate how fast you use each colour.
          </Empty>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {finished.map((bp) => (
              <BlueprintCard
                key={bp.id}
                bp={bp}
                shortByCode={shortByCode}
                onEdit={() => setEditing(bp)}
                onFinish={() => setFinishing(bp)}
                onReopen={() => update((prev) => unfinishBlueprint(prev, bp.id))}
                onDelete={() => update((prev) => deleteBlueprint(prev, bp.id))}
              />
            ))}
          </ul>
        )}
      </Card>

      {swapStats.length > 0 && (
        <Card
          title="Colours you keep swapping"
          subtitle="Every time you deviated from a chart. Worth a look: a colour you always replace may not be worth restocking."
        >
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {swapStats.map((s) => (
              <li key={`${s.planned}->${s.usedCode}`} className="flex items-center gap-1.5">
                <SwapPair from={s.planned} to={s.usedCode} />
                <span className="text-xs text-ink-muted">
                  ×{s.times} · {fmtQty(s.qty)} beads
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {(adding || editing) && (
        <BlueprintEditor
          existing={editing ?? undefined}
          defaultStatus={adding ?? 'planned'}
          onClose={() => {
            setAdding(null);
            setEditing(null);
          }}
        />
      )}
      {finishing && <FinishDialog bp={finishing} onClose={() => setFinishing(null)} />}
    </div>
  );
}

function SwapPair({ from, to }: { from: string; to: string }) {
  const { state } = useAppStore();
  return (
    <span className="inline-flex items-center gap-1">
      <span className="swatch h-4 w-4 rounded-[2px]" style={{ background: hexFor(from, state.colorMeta) }} aria-hidden="true" />
      <span className="tnum text-ink-muted line-through">{from}</span>
      <span className="text-ink-muted">→</span>
      <span className="swatch h-4 w-4 rounded-[2px]" style={{ background: hexFor(to, state.colorMeta) }} aria-hidden="true" />
      <span className="tnum font-medium">{to}</span>
    </span>
  );
}

function BlueprintCard({
  bp,
  shortByCode,
  onEdit,
  onFinish,
  onReopen,
  onDelete,
}: {
  bp: Blueprint;
  shortByCode: Map<string, number>;
  onEdit: () => void;
  onFinish: () => void;
  onReopen?: () => void;
  onDelete: () => void;
}) {
  const { state } = useAppStore();
  const [confirming, setConfirming] = useState(false);
  const isFinished = bp.status === 'finished';
  const lines = isFinished ? bp.actual : effectiveLines(bp);
  const total = lines.reduce((a, l) => a + l.qty, 0);
  const blockers = !isFinished ? lines.filter((l) => shortByCode.has(l.code)) : [];

  return (
    <li className="flex gap-3 rounded-xl border border-hairline bg-surface-2 p-3">
      {bp.image ? (
        <img
          src={bp.image}
          alt={bp.title}
          className="h-20 w-20 shrink-0 rounded-lg border border-hairline object-cover"
        />
      ) : (
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-dashed border-hairline text-[10px] text-ink-muted">
          no image
        </div>
      )}

      <div className="min-w-0 flex-1">
        <h3 className="truncate font-medium">{bp.title}</h3>
        <p className="tnum text-xs text-ink-2">
          {fmtQty(total)} beads · {lines.length} colours ·{' '}
          {isFinished ? fmtDate(bp.finishedOn) : `added ${fmtDate(bp.createdOn)}`}
        </p>

        <div className="mt-1.5 flex flex-wrap gap-1">
          {lines
            .slice()
            .sort((a, b) => b.qty - a.qty)
            .slice(0, 14)
            .map((l) => (
              <span
                key={l.code}
                className="swatch h-3.5 w-3.5 rounded-[2px]"
                style={{ background: hexFor(l.code, state.colorMeta) }}
                title={`${l.code} — ${fmtQty(l.qty)}`}
              />
            ))}
          {lines.length > 14 && (
            <span className="text-[10px] text-ink-muted">+{lines.length - 14}</span>
          )}
        </div>

        {bp.substitutions.length > 0 && (
          <ul className="mt-1.5 space-y-0.5">
            {bp.substitutions.map((s, i) => (
              <li key={i} className="text-xs">
                <SwapPair from={s.plannedCode} to={s.usedCode} />
              </li>
            ))}
          </ul>
        )}

        {blockers.length > 0 && (
          <p className="tnum mt-1.5 text-xs" style={{ color: 'var(--critical)' }}>
            ▲ short on {blockers.map((b) => b.code).join(', ')}
          </p>
        )}

        <div className="mt-2 flex flex-wrap gap-1.5">
          {!isFinished && (
            <Button variant="primary" className="px-2 py-1 text-xs" onClick={onFinish}>
              Mark finished
            </Button>
          )}
          {isFinished && (
            <Button className="px-2 py-1 text-xs" onClick={onFinish}>
              Edit counts
            </Button>
          )}
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={onEdit}>
            Legend
          </Button>
          {onReopen && (
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={onReopen}>
              Reopen
            </Button>
          )}
          {confirming ? (
            <span className="flex items-center gap-1 text-xs">
              <Button variant="danger" className="px-2 py-1 text-xs" onClick={onDelete}>
                Delete for good
              </Button>
              <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setConfirming(false)}>
                No
              </Button>
            </span>
          ) : (
            <Button
              variant="ghost"
              className="px-2 py-1 text-xs"
              onClick={() => setConfirming(true)}
            >
              Delete
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
