import type { AppState, Blueprint, LedgerEntry, PlanLine } from './types';

/** Sum a ledger into per-colour on-hand counts. */
export function onHandByCode(ledger: readonly LedgerEntry[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of ledger) out.set(e.code, (out.get(e.code) ?? 0) + e.delta);
  return out;
}

/**
 * Beads already promised to blueprints you have queued but not built.
 * A planned blueprint's own substitution notes are respected if present, so a
 * plan you already know you will deviate from reserves the colour you will
 * actually reach for.
 */
export function reservedByCode(blueprints: readonly Blueprint[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const bp of blueprints) {
    if (bp.status !== 'planned') continue;
    for (const line of effectiveLines(bp)) {
      out.set(line.code, (out.get(line.code) ?? 0) + line.qty);
    }
  }
  return out;
}

/**
 * Apply a blueprint's substitutions to its plan, producing the colours that
 * will really be consumed. A substitution moves `qty` from `plannedCode` to
 * `usedCode`; moving more than the plan called for is allowed (you may have
 * needed extra) and simply floors the planned colour at zero.
 */
export function effectiveLines(bp: Blueprint): PlanLine[] {
  const tally = new Map<string, number>();
  for (const l of bp.plan) tally.set(l.code, (tally.get(l.code) ?? 0) + l.qty);
  for (const s of bp.substitutions) {
    const from = tally.get(s.plannedCode) ?? 0;
    tally.set(s.plannedCode, Math.max(0, from - s.qty));
    tally.set(s.usedCode, (tally.get(s.usedCode) ?? 0) + s.qty);
  }
  return [...tally]
    .filter(([, qty]) => qty > 0)
    .map(([code, qty]) => ({ code, qty }));
}

/** Codes that appear anywhere in the user's data — used to hide the long tail. */
export function trackedCodes(state: AppState): Set<string> {
  const s = new Set<string>();
  for (const e of state.ledger) s.add(e.code);
  for (const bp of state.blueprints) {
    for (const l of bp.plan) s.add(l.code);
    for (const l of bp.actual) s.add(l.code);
    for (const x of bp.substitutions) {
      s.add(x.plannedCode);
      s.add(x.usedCode);
    }
  }
  for (const o of state.orders) for (const l of o.lines) s.add(l.code);
  for (const [code, meta] of Object.entries(state.colorMeta)) {
    if (meta.watch || meta.name || meta.hex) s.add(code);
  }
  return s;
}

/**
 * How often you have reached for colour B where the chart said colour A.
 * Surfaced when logging a finish so repeat swaps are one click.
 */
export function substitutionHistory(
  blueprints: readonly Blueprint[],
): Map<string, { usedCode: string; times: number; qty: number }[]> {
  const byPlanned = new Map<string, Map<string, { times: number; qty: number }>>();
  for (const bp of blueprints) {
    for (const s of bp.substitutions) {
      const inner = byPlanned.get(s.plannedCode) ?? new Map();
      const prev = inner.get(s.usedCode) ?? { times: 0, qty: 0 };
      inner.set(s.usedCode, { times: prev.times + 1, qty: prev.qty + s.qty });
      byPlanned.set(s.plannedCode, inner);
    }
  }
  const out = new Map<string, { usedCode: string; times: number; qty: number }[]>();
  for (const [planned, inner] of byPlanned) {
    out.set(
      planned,
      [...inner]
        .map(([usedCode, v]) => ({ usedCode, ...v }))
        .sort((a, b) => b.times - a.times || b.qty - a.qty),
    );
  }
  return out;
}
