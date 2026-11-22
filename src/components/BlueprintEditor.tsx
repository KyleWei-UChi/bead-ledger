import { useMemo, useState } from 'react';
import { addBlueprint, updateBlueprint } from '../domain/actions';
import { forecastAll, today } from '../domain/forecast';
import type { Blueprint, PlanLine } from '../domain/types';
import { downscaleImage } from '../store/image';
import { fmtQty } from '../lib/format';
import { useAppStore } from '../store/useAppStore';
import { LineEditor } from './LineEditor';
import { Button, Field, ImageDrop, Modal } from './ui';

/**
 * Add or edit a blueprint's legend. Planned blueprints reserve their beads
 * immediately, so the editor shows live availability per colour.
 */
export function BlueprintEditor({
  existing,
  defaultStatus = 'planned',
  onClose,
}: {
  existing?: Blueprint;
  defaultStatus?: 'planned' | 'finished';
  onClose: () => void;
}) {
  const { state, update, uploadImage } = useAppStore();
  const [title, setTitle] = useState(existing?.title ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [image, setImage] = useState(existing?.image);
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<PlanLine[]>(existing?.plan ?? []);
  const [err, setErr] = useState<string | null>(null);

  const available = useMemo(() => {
    const f = forecastAll(state);
    const m = new Map<string, number>();
    for (const x of f) {
      // When editing an existing planned blueprint, its own reservation should
      // not count against itself or every row would look short.
      const ownReservation =
        existing?.status === 'planned'
          ? (existing.plan.find((l) => l.code === x.code)?.qty ?? 0)
          : 0;
      m.set(x.code, x.available + ownReservation);
    }
    for (const l of lines) if (!m.has(l.code)) m.set(l.code, 0);
    return m;
  }, [state, lines, existing]);

  const pickImage = async (file: File) => {
    setBusy(true);
    setErr(null);
    try {
      const blob = await downscaleImage(file);
      setImage(await uploadImage(blob));
    } catch (e) {
      setErr(`Could not read that image: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (lines.length === 0) {
      setErr('Add at least one colour, or paste the chart legend.');
      return;
    }
    if (existing) {
      update((prev) => updateBlueprint(prev, existing.id, { title, notes, image, plan: lines }));
    } else {
      update((prev) => {
        const res = addBlueprint(prev, {
          title,
          plan: lines,
          image,
          notes,
          status: defaultStatus,
          createdOn: today(),
        });
        return res.state;
      });
    }
    onClose();
  };

  const total = lines.reduce((a, l) => a + l.qty, 0);
  const shortfalls = lines.filter((l) => l.qty > (available.get(l.code) ?? 0));

  return (
    <Modal
      wide
      title={existing ? 'Edit blueprint' : 'New blueprint'}
      subtitle={
        existing
          ? 'Changing the legend re-reserves beads for this blueprint.'
          : 'Enter the legend from your chart. Paste it if it is already in text form.'
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            {existing ? 'Save changes' : 'Add blueprint'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title">
            <input
              className="field w-full"
              value={title}
              placeholder="e.g. Jigglypuff 58×58"
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Blueprint image" hint="Resized to 1600px and stored with your data.">
            <ImageDrop value={image} onFile={pickImage} busy={busy} />
          </Field>
        </div>

        <div>
          <span className="mb-1 block text-xs font-medium tracking-wide text-ink-2 uppercase">
            Legend — {fmtQty(total)} beads
          </span>
          <LineEditor
            lines={lines}
            onChange={setLines}
            available={available}
            emptyHint="Paste the legend from your chart, or add colours one at a time."
          />
        </div>

        {shortfalls.length > 0 && (
          <p className="rounded-lg border p-2.5 text-sm" style={{ borderColor: 'var(--warning)' }}>
            <span style={{ color: 'var(--warning)' }}>◐ Not enough stock</span> for{' '}
            <span className="tnum">{shortfalls.map((s) => s.code).join(', ')}</span>. That is fine —
            it will show up on the order list.
          </p>
        )}

        <Field label="Notes">
          <textarea
            className="field h-16 w-full"
            value={notes}
            placeholder="Where the chart came from, board size, anything to remember…"
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        {err && (
          <p className="text-sm" style={{ color: 'var(--critical)' }}>
            ▲ {err}
          </p>
        )}
      </div>
    </Modal>
  );
}
