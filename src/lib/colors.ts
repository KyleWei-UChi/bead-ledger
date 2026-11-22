import { MARD_BY_CODE } from '../palette/mard221';
import type { ColorMeta } from '../domain/types';

/** The hex to render for a code, honouring the user's own correction. */
export function hexFor(code: string, meta: Record<string, ColorMeta>): string {
  const override = meta[code]?.hex;
  if (override && /^#[0-9a-fA-F]{6}$/.test(override)) return override;
  return MARD_BY_CODE[code]?.hex ?? '#888888';
}

export function labelFor(code: string, meta: Record<string, ColorMeta>): string {
  const name = meta[code]?.name?.trim();
  return name ? `${code} · ${name}` : code;
}

export function seriesOf(code: string): string {
  return code.slice(0, 1).toUpperCase();
}
