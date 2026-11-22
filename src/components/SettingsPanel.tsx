import { useRef, useState } from 'react';
import { exportJSON, importJSON } from '../domain/actions';
import { zForServiceLevel } from '../domain/forecast';
import { MARD_BY_CODE } from '../palette/mard221';
import type { Settings } from '../domain/types';
import { hexFor } from '../lib/colors';
import { STORE_TARGET } from '../store';
import { saveFile } from '../store/download';
import { useAppStore } from '../store/useAppStore';
import { CodePicker } from './CodePicker';
import { Button, Card, Field } from './ui';

export function SettingsPanel() {
  const { state, update, replace, adapter } = useAppStore();
  const s = state.settings;
  const fileRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [tweakCode, setTweakCode] = useState<string | null>(null);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    update((prev) => ({
      ...prev,
      settings: { ...prev.settings, [key]: value },
      updatedAt: new Date().toISOString(),
    }));

  const [exportErr, setExportErr] = useState<string | null>(null);
  const [fallbackJson, setFallbackJson] = useState<string | null>(null);

  const doExport = async () => {
    const json = exportJSON(state);
    setExportErr(null);
    try {
      await saveFile(`bead-ledger-${new Date().toISOString().slice(0, 10)}.json`, json);
    } catch (e) {
      // Never leave the user without a way out: show the JSON to copy.
      setExportErr((e as Error).message);
      setFallbackJson(json);
    }
  };

  const doImport = async (file: File) => {
    try {
      const next = importJSON(await file.text());
      replace(next);
      setImportMsg({
        ok: true,
        text: `Loaded ${next.ledger.length} ledger entries and ${next.blueprints.length} blueprints.`,
      });
    } catch (e) {
      setImportMsg({ ok: false, text: `That file could not be read: ${(e as Error).message}` });
    }
  };

  const z = zForServiceLevel(s.serviceLevel);
  const protection = s.leadTimeDays + s.safetyDays;

  return (
    <div className="space-y-5">
      <Card
        title="Reorder rules"
        subtitle="These decide when a colour gets flagged. The threshold is computed per colour from your own history, so a colour you tear through is warned about earlier than one you dab on."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field
            label="Shipping lead time (days)"
            hint="How long from placing an order to beads in hand."
          >
            <input
              type="number"
              min={1}
              max={365}
              className="field tnum w-full"
              value={s.leadTimeDays}
              onChange={(e) => set('leadTimeDays', Math.max(1, Number(e.target.value) || 1))}
            />
          </Field>
          <Field label="Extra buffer (days)" hint="Slack for your own procrastination.">
            <input
              type="number"
              min={0}
              max={180}
              className="field tnum w-full"
              value={s.safetyDays}
              onChange={(e) => set('safetyDays', Math.max(0, Number(e.target.value) || 0))}
            />
          </Field>
          <Field
            label="Confidence"
            hint={`Safety stock = ${z.toFixed(2)} × how erratic the colour is. Higher means earlier warnings.`}
          >
            <select
              className="field w-full"
              value={s.serviceLevel}
              onChange={(e) => set('serviceLevel', Number(e.target.value))}
            >
              <option value={0.8}>80% — relaxed</option>
              <option value={0.9}>90%</option>
              <option value={0.95}>95% — recommended</option>
              <option value={0.98}>98%</option>
              <option value={0.995}>99.5% — never run out</option>
            </select>
          </Field>
          <Field
            label="History window (days)"
            hint="How far back consumption is averaged. Shorter reacts faster; longer is steadier."
          >
            <input
              type="number"
              min={30}
              max={1095}
              className="field tnum w-full"
              value={s.historyWindowDays}
              onChange={(e) => set('historyWindowDays', Math.max(30, Number(e.target.value) || 30))}
            />
          </Field>
          <Field label="Order cover (days)" hint="How long a new order should last. Bigger orders, fewer of them.">
            <input
              type="number"
              min={30}
              max={1095}
              className="field tnum w-full"
              value={s.targetCoverDays}
              onChange={(e) => set('targetCoverDays', Math.max(30, Number(e.target.value) || 30))}
            />
          </Field>
          <Field label="Pack size" hint="Suggested quantities round up to this.">
            <input
              type="number"
              min={1}
              max={5000}
              className="field tnum w-full"
              value={s.packSize}
              onChange={(e) => set('packSize', Math.max(1, Number(e.target.value) || 1))}
            />
          </Field>
        </div>

        <p className="mt-4 rounded-lg border border-hairline bg-surface-2 p-3 text-sm text-ink-2">
          Right now a colour is flagged when what is left would not survive{' '}
          <strong className="text-ink">{protection} days</strong> of your typical use, plus a
          buffer scaled by that colour’s own ups and downs. A colour used in sudden big batches
          therefore gets a much higher threshold than one used steadily, even at the same average
          rate.
        </p>
      </Card>

      <Card
        title="Palette corrections"
        subtitle="The bundled hex values are approximations scraped from public charts — no official MARD chart is published. Fix any that look wrong against your real beads."
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[12rem]">
            <Field label="Colour">
              <CodePicker value={tweakCode ?? undefined} onPick={setTweakCode} placeholder="Pick a colour…" />
            </Field>
          </div>
          {tweakCode && (
            <>
              <div>
                <Field label="Shown as">
                  <input
                    type="color"
                    className="field h-9 w-20 p-1"
                    value={hexFor(tweakCode, state.colorMeta)}
                    onChange={(e) =>
                      update((prev) => ({
                        ...prev,
                        colorMeta: {
                          ...prev.colorMeta,
                          [tweakCode]: { ...prev.colorMeta[tweakCode], hex: e.target.value },
                        },
                        updatedAt: new Date().toISOString(),
                      }))
                    }
                  />
                </Field>
              </div>
              <div>
                <Field label="Your name">
                  <input
                    className="field w-40"
                    value={state.colorMeta[tweakCode]?.name ?? ''}
                    placeholder="e.g. 奶油黄"
                    onChange={(e) =>
                      update((prev) => ({
                        ...prev,
                        colorMeta: {
                          ...prev.colorMeta,
                          [tweakCode]: {
                            ...prev.colorMeta[tweakCode],
                            name: e.target.value || undefined,
                          },
                        },
                        updatedAt: new Date().toISOString(),
                      }))
                    }
                  />
                </Field>
              </div>
              <Button
                onClick={() =>
                  update((prev) => ({
                    ...prev,
                    colorMeta: {
                      ...prev.colorMeta,
                      [tweakCode]: { ...prev.colorMeta[tweakCode], hex: undefined },
                    },
                    updatedAt: new Date().toISOString(),
                  }))
                }
              >
                Reset to default ({MARD_BY_CODE[tweakCode]?.hex})
              </Button>
            </>
          )}
        </div>
      </Card>

      <Card
        title="Your data"
        subtitle={
          STORE_TARGET === 'artifact'
            ? 'This copy stores data in the Artifact database. Export regularly if this is your only copy.'
            : 'Everything lives in a plain JSON file in this project. Nothing is sent anywhere.'
        }
      >
        <dl className="mb-4 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs tracking-wide text-ink-muted uppercase">Backend</dt>
            <dd>{adapter?.label ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs tracking-wide text-ink-muted uppercase">Location</dt>
            <dd className="tnum break-all">{adapter?.location ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs tracking-wide text-ink-muted uppercase">Ledger entries</dt>
            <dd className="tnum">{state.ledger.length}</dd>
          </div>
          <div>
            <dt className="text-xs tracking-wide text-ink-muted uppercase">Last change</dt>
            <dd className="tnum">{new Date(state.updatedAt).toLocaleString()}</dd>
          </div>
        </dl>

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => void doExport()}>
            Export JSON
          </Button>
          <Button onClick={() => fileRef.current?.click()}>Import JSON</Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void doImport(f);
              e.target.value = '';
            }}
          />
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          Import replaces everything currently loaded. Export first if you are unsure. The same
          file works in the local app and the hosted copy, so you can move between them.
        </p>
        {exportErr && (
          <div className="mt-3">
            <p className="text-sm" style={{ color: 'var(--warning)' }}>
              ◐ {exportErr}
            </p>
            {fallbackJson && (
              <textarea
                readOnly
                className="field mt-2 h-40 w-full font-mono text-xs"
                value={fallbackJson}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Your data as JSON"
              />
            )}
          </div>
        )}

        {importMsg && (
          <p
            className="mt-2 text-sm"
            style={{ color: importMsg.ok ? 'var(--good)' : 'var(--critical)' }}
          >
            {importMsg.ok ? '✓' : '▲'} {importMsg.text}
          </p>
        )}
      </Card>
    </div>
  );
}
