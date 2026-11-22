/**
 * Core data model.
 *
 * Stock levels are never stored directly. They are derived by replaying an
 * append-only `ledger`, which means every number in the UI can be traced to a
 * dated event, and consumption history for forecasting comes for free.
 */

export type ISODate = string; // 'YYYY-MM-DD'

export type LedgerKind =
  | 'opening' // initial count when you first set a colour up
  | 'restock' // a supplement order arrived
  | 'consume' // beads used finishing a blueprint
  | 'adjust'; // manual correction after a recount, can be negative

export interface LedgerEntry {
  id: string;
  date: ISODate;
  kind: LedgerKind;
  code: string;
  /** Signed bead count. `consume` entries are negative. */
  delta: number;
  /** Links a batch of entries to the blueprint or order that produced them. */
  refId?: string;
  note?: string;
}

/** A supplement order you placed. Entries land in the ledger when it arrives. */
export interface Order {
  id: string;
  placedOn: ISODate;
  arrivedOn?: ISODate;
  vendor?: string;
  note?: string;
  lines: { code: string; qty: number }[];
}

export type BlueprintStatus = 'planned' | 'finished';

/** One colour row of a blueprint's legend. */
export interface PlanLine {
  code: string;
  qty: number;
}

/**
 * Recorded when you knowingly swapped one colour for another while building.
 * `qty` is counted against `usedCode`, not `plannedCode`.
 */
export interface Substitution {
  plannedCode: string;
  usedCode: string;
  qty: number;
  note?: string;
}

export interface Blueprint {
  id: string;
  title: string;
  status: BlueprintStatus;
  createdOn: ISODate;
  finishedOn?: ISODate;
  /** Object-URL-free storage: data URL for Artifact mode, /api path locally. */
  image?: string;
  /** Legend from the chart: what the pattern calls for. */
  plan: PlanLine[];
  /** What you actually used. Only meaningful once finished. */
  actual: PlanLine[];
  substitutions: Substitution[];
  notes?: string;
  /** Planned blueprints can be given a priority order for the forecast. */
  sortIndex?: number;
}

export interface Settings {
  /** Shipping + handling time for a supplement order, in days. */
  leadTimeDays: number;
  /** Extra buffer on top of lead time before you want to be warned. */
  safetyDays: number;
  /**
   * Target probability of not running out during the lead time, 0.5–0.999.
   * Higher = fatter safety stock = earlier warnings.
   */
  serviceLevel: number;
  /** Window of consumption history used to estimate burn rate. */
  historyWindowDays: number;
  /** Colours below this are treated as "a packet", used for order rounding. */
  packSize: number;
  /**
   * When an order is warranted, buy enough to cover roughly this many days of
   * consumption. Ordering from overseas is slow and fiddly, so this is
   * deliberately generous — it is about order *size*, not order *timing*.
   */
  targetCoverDays: number;
  /** Ignore colours you have never stocked and never planned. */
  hideUntracked: boolean;
}

/** Per-colour overrides that belong to the user, not to the palette module. */
export interface ColorMeta {
  /** Your own name for it, e.g. '奶油黄'. */
  name?: string;
  /** Corrected hex if the scraped default looks wrong on your beads. */
  hex?: string;
  /** Pin a colour to the dashboard regardless of status. */
  watch?: boolean;
  /** Treat as discontinued: excluded from reorder advice. */
  retired?: boolean;
}

export interface AppState {
  version: 1;
  settings: Settings;
  ledger: LedgerEntry[];
  orders: Order[];
  blueprints: Blueprint[];
  colorMeta: Record<string, ColorMeta>;
  updatedAt: string;
  /** Set by scripts/seed-demo.mjs. Drives the "this is not your data" banner. */
  demo?: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  leadTimeDays: 45,
  safetyDays: 14,
  serviceLevel: 0.95,
  historyWindowDays: 180,
  packSize: 100,
  targetCoverDays: 150,
  hideUntracked: true,
};

export function emptyState(): AppState {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    ledger: [],
    orders: [],
    blueprints: [],
    colorMeta: {},
    updatedAt: new Date().toISOString(),
  };
}
