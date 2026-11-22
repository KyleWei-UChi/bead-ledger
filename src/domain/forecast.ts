import { onHandByCode, reservedByCode } from './inventory';
import type { AppState, ISODate, LedgerEntry, Settings } from './types';

export const DAY_MS = 86_400_000;

export function today(): ISODate {
  return toISODate(new Date());
}

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / DAY_MS);
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = parseISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/**
 * Inverse standard normal CDF (Acklam's rational approximation, |error| < 1.15e-9).
 * Used to turn a service level into a safety-stock multiplier.
 */
export function zForServiceLevel(p: number): number {
  const q = Math.min(Math.max(p, 0.5001), 0.9999);
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416];
  const pLow = 0.02425;
  let x: number;
  if (q < pLow) {
    const u = Math.sqrt(-2 * Math.log(q));
    x = (((((c[0]! * u + c[1]!) * u + c[2]!) * u + c[3]!) * u + c[4]!) * u + c[5]!) /
      ((((d[0]! * u + d[1]!) * u + d[2]!) * u + d[3]!) * u + 1);
  } else if (q <= 1 - pLow) {
    const u = q - 0.5;
    const r = u * u;
    x = (((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * u /
      (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
  } else {
    const u = Math.sqrt(-2 * Math.log(1 - q));
    x = -(((((c[0]! * u + c[1]!) * u + c[2]!) * u + c[3]!) * u + c[4]!) * u + c[5]!) /
      ((((d[0]! * u + d[1]!) * u + d[2]!) * u + d[3]!) * u + 1);
  }
  return x;
}

export type StockStatus = 'short' | 'order' | 'watch' | 'ok' | 'idle';

export interface ColorForecast {
  code: string;
  onHand: number;
  reserved: number;
  /** On hand minus what queued blueprints will eat. The number that matters. */
  available: number;
  /** Beads per day, averaged over the history window. */
  burnRate: number;
  /** Weekly consumption standard deviation — how lumpy this colour's use is. */
  weeklySigma: number;
  /** Total consumed inside the history window. */
  consumedInWindow: number;
  /** Number of finished blueprints that used this colour, inside the window. */
  usesInWindow: number;
  /** Safety stock from demand variability over the protection period. */
  safetyStock: number;
  /**
   * The dynamic threshold. Expected use over (lead time + safety days) plus
   * safety stock. Fast or erratic colours get a higher one automatically.
   */
  reorderPoint: number;
  /** Days until `available` hits zero at the current burn rate. */
  daysOfCover: number;
  /** Date `available` is projected to hit zero, null if burn rate is zero. */
  runsOutOn: ISODate | null;
  /** Latest date you could place an order and still not run dry. */
  orderByOn: ISODate | null;
  status: StockStatus;
  /** Rounded-up quantity to buy so stock lasts `targetCoverDays`. */
  suggestedOrderQty: number;
}

interface ConsumptionStats {
  total: number;
  uses: number;
  weeklyBuckets: number[];
}

/**
 * Consumption per colour inside the history window, bucketed by week so that
 * variability can be measured. Only `consume` entries count: restocks and
 * manual adjustments are not demand.
 */
function consumptionStats(
  ledger: readonly LedgerEntry[],
  windowDays: number,
  asOf: ISODate,
): Map<string, ConsumptionStats> {
  const start = addDays(asOf, -windowDays);
  const bucketCount = Math.max(1, Math.ceil(windowDays / 7));
  const out = new Map<string, ConsumptionStats>();
  for (const e of ledger) {
    if (e.kind !== 'consume') continue;
    if (e.date < start || e.date > asOf) continue;
    const used = Math.abs(e.delta);
    if (used <= 0) continue;
    const age = daysBetween(e.date, asOf); // 0 = today
    const bucket = Math.min(bucketCount - 1, Math.floor(age / 7));
    let s = out.get(e.code);
    if (!s) {
      s = { total: 0, uses: 0, weeklyBuckets: new Array(bucketCount).fill(0) };
      out.set(e.code, s);
    }
    s.total += used;
    s.uses += 1;
    s.weeklyBuckets[bucket] = (s.weeklyBuckets[bucket] ?? 0) + used;
  }
  return out;
}

function sampleStdDev(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance =
    xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

function roundUpTo(n: number, step: number): number {
  if (step <= 1) return Math.ceil(n);
  return Math.ceil(n / step) * step;
}

export function forecastColor(args: {
  code: string;
  onHand: number;
  reserved: number;
  stats: ConsumptionStats | undefined;
  settings: Settings;
  asOf: ISODate;
}): ColorForecast {
  const { code, onHand, reserved, stats, settings, asOf } = args;
  const available = onHand - reserved;
  const windowDays = Math.max(1, settings.historyWindowDays);

  const consumedInWindow = stats?.total ?? 0;
  const usesInWindow = stats?.uses ?? 0;
  const burnRate = consumedInWindow / windowDays;
  const weeklySigma = sampleStdDev(stats?.weeklyBuckets ?? []);

  // Protection period: how long you are exposed after noticing you are low.
  const protectionDays = Math.max(1, settings.leadTimeDays + settings.safetyDays);
  const z = zForServiceLevel(settings.serviceLevel);
  // Scale weekly sigma to the protection period: sigma grows with sqrt(time).
  const sigmaOverLead = weeklySigma * Math.sqrt(protectionDays / 7);
  const safetyStock = burnRate > 0 ? z * sigmaOverLead : 0;
  const reorderPoint = burnRate > 0 ? burnRate * protectionDays + safetyStock : 0;

  const daysOfCover = burnRate > 0 ? available / burnRate : Number.POSITIVE_INFINITY;
  const runsOutOn =
    burnRate > 0 && Number.isFinite(daysOfCover)
      ? addDays(asOf, Math.max(0, Math.floor(daysOfCover)))
      : null;
  const orderByOn =
    burnRate > 0 && Number.isFinite(daysOfCover)
      ? addDays(asOf, Math.floor(daysOfCover - protectionDays))
      : null;

  let status: StockStatus;
  if (burnRate <= 0 && reserved <= 0) {
    status = available < 0 ? 'short' : 'idle';
  } else if (available < 0) {
    status = 'short';
  } else if (available <= reorderPoint) {
    status = 'order';
  } else if (available <= reorderPoint * 1.5) {
    status = 'watch';
  } else {
    status = 'ok';
  }

  // Order up to a level that covers the protection period plus a long tail,
  // because placing an overseas order is the expensive part, not the beads.
  const targetLevel =
    burnRate > 0
      ? burnRate * (protectionDays + settings.targetCoverDays) + safetyStock
      : Math.max(0, -available);
  const suggestedOrderQty =
    status === 'ok' || status === 'idle'
      ? 0
      : roundUpTo(Math.max(0, targetLevel - available), settings.packSize);

  return {
    code,
    onHand,
    reserved,
    available,
    burnRate,
    weeklySigma,
    consumedInWindow,
    usesInWindow,
    safetyStock,
    reorderPoint,
    daysOfCover,
    runsOutOn,
    orderByOn,
    status,
    suggestedOrderQty,
  };
}

export function forecastAll(state: AppState, asOf: ISODate = today()): ColorForecast[] {
  const onHand = onHandByCode(state.ledger);
  const reserved = reservedByCode(state.blueprints);
  const stats = consumptionStats(state.ledger, state.settings.historyWindowDays, asOf);

  const codes = new Set<string>([...onHand.keys(), ...reserved.keys(), ...stats.keys()]);
  for (const [code, meta] of Object.entries(state.colorMeta)) {
    if (meta.watch) codes.add(code);
  }

  return [...codes]
    .filter((code) => !state.colorMeta[code]?.retired)
    .map((code) =>
      forecastColor({
        code,
        onHand: onHand.get(code) ?? 0,
        reserved: reserved.get(code) ?? 0,
        stats: stats.get(code),
        settings: state.settings,
        asOf,
      }),
    );
}

export const STATUS_RANK: Record<StockStatus, number> = {
  short: 0,
  order: 1,
  watch: 2,
  ok: 3,
  idle: 4,
};

/** Dashboard ordering: trouble first, then soonest to run out. */
export function byUrgency(a: ColorForecast, b: ColorForecast): number {
  const r = STATUS_RANK[a.status] - STATUS_RANK[b.status];
  if (r !== 0) return r;
  if (a.daysOfCover !== b.daysOfCover) return a.daysOfCover - b.daysOfCover;
  return a.code.localeCompare(b.code, undefined, { numeric: true });
}

/** Monthly consumption series per colour, for the distribution charts. */
export function monthlyConsumption(
  ledger: readonly LedgerEntry[],
  months: number,
  asOf: ISODate = today(),
): { month: string; byCode: Map<string, number>; total: number }[] {
  const end = parseISODate(asOf);
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const index = new Map(keys.map((k, i) => [k, i]));
  const out = keys.map((month) => ({ month, byCode: new Map<string, number>(), total: 0 }));
  for (const e of ledger) {
    if (e.kind !== 'consume') continue;
    const key = e.date.slice(0, 7);
    const i = index.get(key);
    if (i === undefined) continue;
    const bucket = out[i]!;
    const used = Math.abs(e.delta);
    bucket.byCode.set(e.code, (bucket.byCode.get(e.code) ?? 0) + used);
    bucket.total += used;
  }
  return out;
}
