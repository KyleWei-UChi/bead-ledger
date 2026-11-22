import { MARD_BY_CODE } from '../palette/mard221';
import { effectiveLines } from './inventory';
import { today } from './forecast';
import { DEFAULT_SETTINGS } from './types';
import type {
  AppState,
  Blueprint,
  ISODate,
  LedgerEntry,
  Order,
  PlanLine,
  Substitution,
} from './types';

export function newId(prefix: string): string {
  const rand =
    globalThis.crypto?.randomUUID?.().slice(0, 8) ??
    Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}`;
}

function touch(state: AppState): AppState {
  return { ...state, updatedAt: new Date().toISOString() };
}

/** Collapse duplicate codes and drop non-positive quantities. */
export function normalizeLines(lines: readonly PlanLine[]): PlanLine[] {
  const t = new Map<string, number>();
  for (const l of lines) {
    const code = l.code.trim().toUpperCase();
    if (!code) continue;
    const qty = Math.round(Number(l.qty));
    if (!Number.isFinite(qty) || qty <= 0) continue;
    t.set(code, (t.get(code) ?? 0) + qty);
  }
  return [...t].map(([code, qty]) => ({ code, qty }));
}

// ---------------------------------------------------------------- stock edits

/**
 * Set a colour's count to an absolute number by writing the difference.
 * Used both for the initial count and for recounts after you tip the tub out.
 */
export function setStock(
  state: AppState,
  code: string,
  total: number,
  opts: { date?: ISODate; note?: string } = {},
): AppState {
  const current = state.ledger
    .filter((e) => e.code === code)
    .reduce((a, e) => a + e.delta, 0);
  const delta = Math.round(total) - current;
  if (delta === 0) return state;
  const entry: LedgerEntry = {
    id: newId('led'),
    date: opts.date ?? today(),
    kind: current === 0 && state.ledger.every((e) => e.code !== code) ? 'opening' : 'adjust',
    code,
    delta,
    note: opts.note,
  };
  return touch({ ...state, ledger: [...state.ledger, entry] });
}

/** Record a supplement order that has arrived, crediting stock. */
export function addRestock(
  state: AppState,
  lines: readonly PlanLine[],
  opts: { date?: ISODate; vendor?: string; note?: string } = {},
): AppState {
  const clean = normalizeLines(lines);
  if (clean.length === 0) return state;
  const date = opts.date ?? today();
  const order: Order = {
    id: newId('ord'),
    placedOn: date,
    arrivedOn: date,
    vendor: opts.vendor,
    note: opts.note,
    lines: clean,
  };
  const entries: LedgerEntry[] = clean.map((l) => ({
    id: newId('led'),
    date,
    kind: 'restock',
    code: l.code,
    delta: l.qty,
    refId: order.id,
  }));
  return touch({
    ...state,
    orders: [...state.orders, order],
    ledger: [...state.ledger, ...entries],
  });
}

export function deleteOrder(state: AppState, orderId: string): AppState {
  return touch({
    ...state,
    orders: state.orders.filter((o) => o.id !== orderId),
    ledger: state.ledger.filter((e) => e.refId !== orderId),
  });
}

// ------------------------------------------------------------- blueprint edits

export function addBlueprint(
  state: AppState,
  input: {
    title: string;
    plan: readonly PlanLine[];
    status?: 'planned' | 'finished';
    image?: string;
    notes?: string;
    createdOn?: ISODate;
  },
): { state: AppState; id: string } {
  const bp: Blueprint = {
    id: newId('bp'),
    title: input.title.trim() || 'Untitled blueprint',
    status: input.status ?? 'planned',
    createdOn: input.createdOn ?? today(),
    image: input.image,
    plan: normalizeLines(input.plan),
    actual: [],
    substitutions: [],
    notes: input.notes,
    sortIndex: state.blueprints.length,
  };
  return { state: touch({ ...state, blueprints: [...state.blueprints, bp] }), id: bp.id };
}

export function updateBlueprint(
  state: AppState,
  id: string,
  patch: Partial<Omit<Blueprint, 'id'>>,
): AppState {
  return touch({
    ...state,
    blueprints: state.blueprints.map((bp) =>
      bp.id === id
        ? {
            ...bp,
            ...patch,
            plan: patch.plan ? normalizeLines(patch.plan) : bp.plan,
            actual: patch.actual ? normalizeLines(patch.actual) : bp.actual,
          }
        : bp,
    ),
  });
}

/**
 * Mark a blueprint built and deduct what was really used.
 *
 * `actual` is the final truth. `substitutions` are recorded alongside it purely
 * so the swap is visible later and can be suggested next time — they do not
 * change the arithmetic, which always follows `actual`.
 */
export function finishBlueprint(
  state: AppState,
  id: string,
  args: {
    actual: readonly PlanLine[];
    substitutions?: readonly Substitution[];
    finishedOn?: ISODate;
    notes?: string;
  },
): AppState {
  const bp = state.blueprints.find((b) => b.id === id);
  if (!bp) return state;
  const actual = normalizeLines(args.actual);
  const date = args.finishedOn ?? today();

  const subs = (args.substitutions ?? []).filter(
    (s) => s.plannedCode && s.usedCode && s.plannedCode !== s.usedCode && s.qty > 0,
  );

  const entries: LedgerEntry[] = actual.map((l) => ({
    id: newId('led'),
    date,
    kind: 'consume',
    code: l.code,
    delta: -l.qty,
    refId: bp.id,
  }));

  return touch({
    ...state,
    // Replace any previous consumption for this blueprint so re-finishing is safe.
    ledger: [...state.ledger.filter((e) => e.refId !== bp.id || e.kind !== 'consume'), ...entries],
    blueprints: state.blueprints.map((b) =>
      b.id === id
        ? {
            ...b,
            status: 'finished',
            finishedOn: date,
            actual,
            substitutions: [...subs],
            notes: args.notes ?? b.notes,
          }
        : b,
    ),
  });
}

/** Put a finished blueprint back in the queue and refund its consumption. */
export function unfinishBlueprint(state: AppState, id: string): AppState {
  return touch({
    ...state,
    ledger: state.ledger.filter((e) => !(e.refId === id && e.kind === 'consume')),
    blueprints: state.blueprints.map((b) =>
      b.id === id
        ? { ...b, status: 'planned', finishedOn: undefined, actual: [], substitutions: [] }
        : b,
    ),
  });
}

export function deleteBlueprint(state: AppState, id: string): AppState {
  return touch({
    ...state,
    ledger: state.ledger.filter((e) => e.refId !== id),
    blueprints: state.blueprints.filter((b) => b.id !== id),
  });
}

/** Seed a finish form from the plan, pre-applying known substitutions. */
export function prefillActual(bp: Blueprint): PlanLine[] {
  return effectiveLines(bp);
}

// ------------------------------------------------------------- legend parsing

export interface ParsedLegend {
  lines: PlanLine[];
  unknownCodes: string[];
  skipped: string[];
}

const CODE_RE = '[A-Ha-hMm]\\s?\\d{1,2}';

/**
 * Parse a pasted legend from a coded grid chart.
 *
 * Handles the shapes these charts actually come in:
 *   A1 120        A1 x120       A1:120      A1 × 120
 *   120 A1        A1,120        A1  120  B3  44   (several per line)
 * Codes are validated against the MARD 221 palette; anything unrecognised is
 * reported rather than silently dropped.
 */
export function parseLegend(text: string): ParsedLegend {
  const lines: PlanLine[] = [];
  const unknownCodes: string[] = [];
  const skipped: string[] = [];

  const pairRe = new RegExp(
    `(?:(${CODE_RE})\\s*(?:[x×*:：=,，、\\-\\s]\\s*)?(\\d{1,6})` +
      `|(\\d{1,6})\\s*(?:[x×*:：=,，、\\-]\\s*)?(${CODE_RE}))`,
    'g',
  );

  for (const raw of text.split(/\r?\n/)) {
    const row = raw.trim();
    if (!row) continue;
    let found = 0;
    for (const m of row.matchAll(pairRe)) {
      const code = (m[1] ?? m[4] ?? '').replace(/\s+/g, '').toUpperCase();
      const qty = Number(m[2] ?? m[3]);
      if (!code || !Number.isFinite(qty) || qty <= 0) continue;
      found++;
      if (!MARD_BY_CODE[code]) {
        if (!unknownCodes.includes(code)) unknownCodes.push(code);
        continue;
      }
      lines.push({ code, qty });
    }
    if (found === 0) skipped.push(row);
  }

  return { lines: normalizeLines(lines), unknownCodes, skipped };
}

// ------------------------------------------------------------------- transfer

export function exportJSON(state: AppState): string {
  return JSON.stringify(state, null, 2);
}

/** Validate and coerce an imported file into usable state. Throws on garbage. */
export function importJSON(text: string): AppState {
  const raw: unknown = JSON.parse(text);
  if (typeof raw !== 'object' || raw === null) throw new Error('Not an object');
  const o = raw as Partial<AppState>;
  if (!Array.isArray(o.ledger)) throw new Error('Missing ledger array');
  if (!Array.isArray(o.blueprints)) throw new Error('Missing blueprints array');
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS, ...(o.settings ?? {}) },
    ledger: o.ledger,
    orders: Array.isArray(o.orders) ? o.orders : [],
    blueprints: o.blueprints,
    colorMeta: typeof o.colorMeta === 'object' && o.colorMeta ? o.colorMeta : {},
    demo: o.demo === true ? true : undefined,
    updatedAt: new Date().toISOString(),
  };
}
