import { describe, expect, it } from 'vitest';
import {
  addBlueprint,
  addRestock,
  finishBlueprint,
  parseLegend,
  setStock,
  unfinishBlueprint,
} from '../src/domain/actions';
import { effectiveLines, onHandByCode, reservedByCode, substitutionHistory } from '../src/domain/inventory';
import { forecastAll, zForServiceLevel } from '../src/domain/forecast';
import { emptyState } from '../src/domain/types';
import { MARD_221, MARD_BY_CODE } from '../src/palette/mard221';

describe('palette', () => {
  it('holds exactly 221 unique codes', () => {
    expect(MARD_221).toHaveLength(221);
    expect(new Set(MARD_221.map((c) => c.code)).size).toBe(221);
  });

  it('matches the published series sizes', () => {
    const counts: Record<string, number> = {};
    for (const c of MARD_221) counts[c.series] = (counts[c.series] ?? 0) + 1;
    expect(counts).toEqual({ A: 26, B: 32, C: 29, D: 26, E: 24, F: 25, G: 21, H: 23, M: 15 });
  });

  it('has a valid hex for every colour', () => {
    for (const c of MARD_221) expect(c.hex).toMatch(/^#[0-9A-F]{6}$/);
  });
});

describe('stock arithmetic', () => {
  it('derives on-hand from the ledger', () => {
    let s = emptyState();
    s = setStock(s, 'A1', 500, { date: '2026-01-01' });
    s = addRestock(s, [{ code: 'A1', qty: 1000 }], { date: '2026-02-01' });
    expect(onHandByCode(s.ledger).get('A1')).toBe(1500);
  });

  it('treats a recount as an adjustment, not a second opening', () => {
    let s = emptyState();
    s = setStock(s, 'A1', 500, { date: '2026-01-01' });
    s = setStock(s, 'A1', 420, { date: '2026-03-01' });
    expect(onHandByCode(s.ledger).get('A1')).toBe(420);
    expect(s.ledger.map((e) => e.kind)).toEqual(['opening', 'adjust']);
  });

  it('reserves beads for planned blueprints only', () => {
    let s = emptyState();
    s = setStock(s, 'A1', 1000, { date: '2026-01-01' });
    const a = addBlueprint(s, { title: 'Queued', plan: [{ code: 'A1', qty: 300 }] });
    s = a.state;
    expect(reservedByCode(s.blueprints).get('A1')).toBe(300);
    s = finishBlueprint(s, a.id, { actual: [{ code: 'A1', qty: 280 }], finishedOn: '2026-02-01' });
    expect(reservedByCode(s.blueprints).get('A1')).toBeUndefined();
    expect(onHandByCode(s.ledger).get('A1')).toBe(720);
  });

  it('re-finishing replaces consumption rather than double-counting', () => {
    let s = emptyState();
    s = setStock(s, 'A1', 1000, { date: '2026-01-01' });
    const a = addBlueprint(s, { title: 'X', plan: [{ code: 'A1', qty: 100 }] });
    s = a.state;
    s = finishBlueprint(s, a.id, { actual: [{ code: 'A1', qty: 100 }], finishedOn: '2026-02-01' });
    s = finishBlueprint(s, a.id, { actual: [{ code: 'A1', qty: 150 }], finishedOn: '2026-02-01' });
    expect(onHandByCode(s.ledger).get('A1')).toBe(850);
  });

  it('un-finishing refunds the beads and re-reserves the plan', () => {
    let s = emptyState();
    s = setStock(s, 'A1', 1000, { date: '2026-01-01' });
    const a = addBlueprint(s, { title: 'X', plan: [{ code: 'A1', qty: 100 }] });
    s = finishBlueprint(a.state, a.id, { actual: [{ code: 'A1', qty: 100 }] });
    s = unfinishBlueprint(s, a.id);
    expect(onHandByCode(s.ledger).get('A1')).toBe(1000);
    expect(reservedByCode(s.blueprints).get('A1')).toBe(100);
  });
});

describe('substitutions', () => {
  it('moves planned quantity onto the colour actually used', () => {
    const bp = {
      id: 'bp1',
      title: 't',
      status: 'planned' as const,
      createdOn: '2026-01-01',
      plan: [{ code: 'A1', qty: 100 }, { code: 'B2', qty: 50 }],
      actual: [],
      substitutions: [{ plannedCode: 'A1', usedCode: 'A2', qty: 40 }],
    };
    expect(effectiveLines(bp).sort((a, b) => a.code.localeCompare(b.code))).toEqual([
      { code: 'A1', qty: 60 },
      { code: 'A2', qty: 40 },
      { code: 'B2', qty: 50 },
    ]);
  });

  it('floors the planned colour at zero when you swap more than called for', () => {
    const bp = {
      id: 'bp1', title: 't', status: 'planned' as const, createdOn: '2026-01-01',
      plan: [{ code: 'A1', qty: 100 }], actual: [],
      substitutions: [{ plannedCode: 'A1', usedCode: 'A2', qty: 130 }],
    };
    expect(effectiveLines(bp)).toEqual([{ code: 'A2', qty: 130 }]);
  });

  it('remembers repeat swaps so they can be suggested again', () => {
    let s = emptyState();
    for (const n of [1, 2]) {
      const a = addBlueprint(s, { title: `bp${n}`, plan: [{ code: 'E4', qty: 60 }] });
      s = finishBlueprint(a.state, a.id, {
        actual: [{ code: 'E5', qty: 60 }],
        substitutions: [{ plannedCode: 'E4', usedCode: 'E5', qty: 60 }],
      });
    }
    expect(substitutionHistory(s.blueprints).get('E4')).toEqual([
      { usedCode: 'E5', times: 2, qty: 120 },
    ]);
  });
});

describe('legend parsing', () => {
  it('reads the common chart formats', () => {
    const { lines } = parseLegend(
      ['A1 120', 'B3 x44', 'C7: 8', 'D2 × 15', '30 E1', 'F4,9', 'H1\t200'].join('\n'),
    );
    expect(lines).toEqual([
      { code: 'A1', qty: 120 }, { code: 'B3', qty: 44 }, { code: 'C7', qty: 8 },
      { code: 'D2', qty: 15 }, { code: 'E1', qty: 30 }, { code: 'F4', qty: 9 },
      { code: 'H1', qty: 200 },
    ]);
  });

  it('reads several pairs from one row and merges duplicates', () => {
    const { lines } = parseLegend('A1 10  B3 20  A1 5');
    expect(lines).toEqual([{ code: 'A1', qty: 15 }, { code: 'B3', qty: 20 }]);
  });

  it('reports unknown codes instead of dropping them silently', () => {
    const { lines, unknownCodes } = parseLegend('A1 10\nZ9 20\nA99 5');
    expect(lines).toEqual([{ code: 'A1', qty: 10 }]);
    expect(unknownCodes).toContain('A99');
  });

  it('flags rows it could not read', () => {
    const { skipped } = parseLegend('A1 10\ntotal beads used\n');
    expect(skipped).toEqual(['total beads used']);
  });

  it('only accepts codes that exist in the palette', () => {
    const { lines } = parseLegend('M15 10\nM16 10');
    expect(lines).toEqual([{ code: 'M15', qty: 10 }]);
    expect(MARD_BY_CODE['M16']).toBeUndefined();
  });
});

describe('reorder forecasting', () => {
  it('maps service level to a sane z', () => {
    expect(zForServiceLevel(0.5)).toBeCloseTo(0, 2);
    expect(zForServiceLevel(0.95)).toBeCloseTo(1.645, 2);
    expect(zForServiceLevel(0.99)).toBeCloseTo(2.326, 2);
  });

  it('gives a fast-moving colour a higher reorder point than a slow one', () => {
    let s = emptyState();
    s = setStock(s, 'A1', 5000, { date: '2026-01-01' });
    s = setStock(s, 'B1', 5000, { date: '2026-01-01' });
    // A1 used every two weeks, B1 used once.
    for (let i = 0; i < 12; i++) {
      const day = String(1 + (i % 28)).padStart(2, '0');
      const month = String(6 + Math.floor(i / 2)).padStart(2, '0');
      const a = addBlueprint(s, { title: `f${i}`, plan: [{ code: 'A1', qty: 200 }] });
      s = finishBlueprint(a.state, a.id, {
        actual: [{ code: 'A1', qty: 200 }],
        finishedOn: `2026-${month}-${day}`,
      });
    }
    const b = addBlueprint(s, { title: 'slow', plan: [{ code: 'B1', qty: 200 }] });
    s = finishBlueprint(b.state, b.id, {
      actual: [{ code: 'B1', qty: 200 }],
      finishedOn: '2026-10-01',
    });

    const f = forecastAll(s, '2026-11-21');
    const a1 = f.find((x) => x.code === 'A1')!;
    const b1 = f.find((x) => x.code === 'B1')!;
    expect(a1.burnRate).toBeGreaterThan(b1.burnRate);
    expect(a1.reorderPoint).toBeGreaterThan(b1.reorderPoint);
    expect(a1.daysOfCover).toBeLessThan(b1.daysOfCover);
  });

  it('adds safety stock for erratic consumption', () => {
    const build = (chunks: number[]) => {
      let s = emptyState();
      s = setStock(s, 'A1', 100000, { date: '2026-01-01' });
      chunks.forEach((qty, i) => {
        const a = addBlueprint(s, { title: `c${i}`, plan: [{ code: 'A1', qty }] });
        s = finishBlueprint(a.state, a.id, {
          actual: [{ code: 'A1', qty }],
          finishedOn: `2026-${String(6 + i).padStart(2, '0')}-10`,
        });
      });
      return forecastAll(s, '2026-11-21').find((x) => x.code === 'A1')!;
    };
    const steady = build([300, 300, 300, 300, 300, 300]);
    const lumpy = build([0, 1500, 0, 0, 0, 300]);
    expect(steady.consumedInWindow).toBe(lumpy.consumedInWindow);
    expect(lumpy.weeklySigma).toBeGreaterThan(steady.weeklySigma);
    expect(lumpy.reorderPoint).toBeGreaterThan(steady.reorderPoint);
  });

  it('flags a shortage when queued blueprints exceed stock', () => {
    let s = emptyState();
    s = setStock(s, 'C3', 100, { date: '2026-01-01' });
    s = addBlueprint(s, { title: 'big', plan: [{ code: 'C3', qty: 400 }] }).state;
    const c3 = forecastAll(s, '2026-11-21').find((x) => x.code === 'C3')!;
    expect(c3.available).toBe(-300);
    expect(c3.status).toBe('short');
    expect(c3.suggestedOrderQty).toBeGreaterThanOrEqual(300);
  });

  it('leaves an unused, well-stocked colour idle with no order advice', () => {
    let s = emptyState();
    s = setStock(s, 'H1', 2000, { date: '2026-01-01' });
    const h1 = forecastAll(s, '2026-11-21').find((x) => x.code === 'H1')!;
    expect(h1.status).toBe('idle');
    expect(h1.suggestedOrderQty).toBe(0);
    expect(h1.daysOfCover).toBe(Number.POSITIVE_INFINITY);
  });
});
