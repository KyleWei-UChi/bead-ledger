import type { StockStatus } from '../domain/forecast';

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString();
}

export function fmtQty(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString();
}

/** Burn rates are small per day; per week reads better for a hobby cadence. */
export function fmtRate(perDay: number): string {
  if (perDay <= 0) return '0';
  const perWeek = perDay * 7;
  if (perWeek < 10) return `${perWeek.toFixed(1)}/wk`;
  return `${Math.round(perWeek).toLocaleString()}/wk`;
}

export function fmtDays(d: number): string {
  if (!Number.isFinite(d)) return 'no usage yet';
  if (d < 0) return 'already short';
  if (d < 1) return 'today';
  if (d < 60) return `${Math.round(d)} days`;
  const months = d / 30.44;
  if (months < 24) return `${months.toFixed(months < 10 ? 1 : 0)} months`;
  return `${(d / 365.25).toFixed(1)} years`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export const STATUS_META: Record<
  StockStatus,
  { label: string; token: string; icon: string; help: string }
> = {
  short: {
    label: 'Short',
    token: 'var(--critical)',
    icon: '▲',
    help: 'Queued blueprints already need more than you have.',
  },
  order: {
    label: 'Order now',
    token: 'var(--serious)',
    icon: '●',
    help: 'Stock is at or below the reorder point for your lead time.',
  },
  watch: {
    label: 'Watch',
    token: 'var(--warning)',
    icon: '◐',
    help: 'Approaching the reorder point. Fine for now.',
  },
  ok: {
    label: 'OK',
    token: 'var(--good)',
    icon: '✓',
    help: 'Comfortably above the reorder point.',
  },
  idle: {
    label: 'Unused',
    token: 'var(--ink-muted)',
    icon: '○',
    help: 'No recorded consumption, so no forecast is possible.',
  },
};

/** Readable text colour to drop on top of an arbitrary bead colour. */
export function inkOn(hex: string): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return '#0b0b0b';
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
  return L > 0.45 ? '#0b0b0b' : '#ffffff';
}
