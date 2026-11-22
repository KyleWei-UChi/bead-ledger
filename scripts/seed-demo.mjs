/**
 * Writes a plausible year of bead history to data/beads.json so the dashboard
 * can be looked at before you have entered anything real.
 *
 *   node scripts/seed-demo.mjs          # refuses to clobber existing data
 *   node scripts/seed-demo.mjs --force  # overwrite
 *
 * Delete data/beads.json (or import your own export) to start clean.
 */
import { mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'beads.json');
const force = process.argv.includes('--force');

const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const shift = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return iso(d);
};
const id = (p) => `${p}_${randomUUID().slice(0, 8)}`;

// A deterministic pseudo-random source keeps the demo stable between runs.
let seed = 20261121;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const between = (lo, hi) => Math.round(lo + rnd() * (hi - lo));

// Skin, outline and background colours get hammered; accents trickle.
const WORKHORSES = ['H1', 'H2', 'H23', 'G4', 'G7', 'A11'];
const MIDS = ['C8', 'C17', 'B12', 'B21', 'E4', 'E12', 'F6', 'F18', 'D9', 'A4', 'A19'];
const ACCENTS = ['M3', 'M9', 'D21', 'E21', 'F23', 'C26', 'B30', 'G15', 'A24', 'H12'];
const ALL = [...WORKHORSES, ...MIDS, ...ACCENTS];

const TITLES = [
  'Pikachu 40×40', 'Totoro night sky', 'Hello Kitty keyring', 'Sanrio pastel set',
  'Chibi astronaut', 'Koi fish coaster', 'Mario 1-up mushroom', 'Stardew chicken',
  'Lavender bouquet', 'Cat loaf magnets', 'Moomin picnic', 'Retro gameboy',
  'Sunflower trivet', 'Panda bookmark', 'Strawberry cow',
];

const ledger = [];
const blueprints = [];
const orders = [];

// --- opening stock, roughly a year ago -------------------------------------
for (const code of ALL) {
  const qty = WORKHORSES.includes(code)
    ? between(4000, 7000)
    : MIDS.includes(code)
      ? between(1200, 2600)
      : between(400, 900);
  ledger.push({ id: id('led'), date: shift(-360), kind: 'opening', code, delta: qty });
}

// --- finished builds, spread across the year -------------------------------
for (let i = 0; i < 15; i++) {
  const day = shift(-345 + i * 23 + between(-4, 4));
  const bpId = id('bp');
  const palette = [
    ...WORKHORSES.slice(0, between(3, 6)),
    ...Array.from({ length: between(3, 7) }, () => pick(MIDS)),
    ...Array.from({ length: between(1, 4) }, () => pick(ACCENTS)),
  ];
  const tally = new Map();
  for (const code of palette) {
    const qty = WORKHORSES.includes(code)
      ? between(150, 600)
      : MIDS.includes(code)
        ? between(40, 220)
        : between(8, 60);
    tally.set(code, (tally.get(code) ?? 0) + qty);
  }
  const plan = [...tally].map(([code, qty]) => ({ code, qty }));

  // Every few builds, swap a colour — the pattern this app is meant to catch.
  const subs = [];
  const actual = plan.map((l) => ({ ...l }));
  if (i % 4 === 1) {
    const victim = actual.find((l) => l.code === 'E4') ?? actual[actual.length - 1];
    if (victim && victim.code !== 'E12') {
      subs.push({ plannedCode: victim.code, usedCode: 'E12', qty: victim.qty });
      const target = actual.find((l) => l.code === 'E12');
      if (target) target.qty += victim.qty;
      else actual.push({ code: 'E12', qty: victim.qty });
      actual.splice(actual.indexOf(victim), 1);
    }
  }
  // Real builds never match the chart exactly.
  for (const l of actual) l.qty = Math.max(1, Math.round(l.qty * (0.9 + rnd() * 0.25)));

  blueprints.push({
    id: bpId,
    title: TITLES[i % TITLES.length],
    status: 'finished',
    createdOn: shift(-348 + i * 23),
    finishedOn: day,
    plan,
    actual,
    substitutions: subs,
    sortIndex: i,
  });
  for (const l of actual) {
    ledger.push({ id: id('led'), date: day, kind: 'consume', code: l.code, delta: -l.qty, refId: bpId });
  }
}

// --- two deliveries along the way ------------------------------------------
for (const [daysAgo, codes] of [
  [-250, [...WORKHORSES, 'C8', 'E12']],
  [-96, [...WORKHORSES.slice(0, 4), 'B12', 'F6', 'M3']],
]) {
  const date = shift(daysAgo);
  const orderId = id('ord');
  const lines = codes.map((code) => ({
    code,
    qty: WORKHORSES.includes(code) ? between(2000, 4000) : between(500, 1500),
  }));
  orders.push({ id: orderId, placedOn: shift(daysAgo - 40), arrivedOn: date, vendor: 'Taobao — MARD flagship', lines });
  for (const l of lines) {
    ledger.push({ id: id('led'), date, kind: 'restock', code: l.code, delta: l.qty, refId: orderId });
  }
}

// --- two builds still queued ----------------------------------------------
for (const [n, title] of [[0, 'Ghibli forest panel 80×80'], [1, 'Birthday name sign']]) {
  const plan = [
    ...WORKHORSES.slice(0, 4).map((code) => ({ code, qty: between(400, 1100) })),
    ...[pick(MIDS), pick(MIDS), pick(ACCENTS)].map((code) => ({ code, qty: between(60, 300) })),
  ];
  const tally = new Map();
  for (const l of plan) tally.set(l.code, (tally.get(l.code) ?? 0) + l.qty);
  blueprints.push({
    id: id('bp'),
    title,
    status: 'planned',
    createdOn: shift(-20 + n * 8),
    plan: [...tally].map(([code, qty]) => ({ code, qty })),
    actual: [],
    substitutions: [],
    sortIndex: 100 + n,
  });
}

ledger.sort((a, b) => a.date.localeCompare(b.date));

const state = {
  version: 1,
  settings: {
    leadTimeDays: 45,
    safetyDays: 14,
    serviceLevel: 0.95,
    historyWindowDays: 180,
    packSize: 100,
    targetCoverDays: 150,
    hideUntracked: true,
  },
  ledger,
  orders,
  blueprints,
  colorMeta: {
    H1: { name: 'white' },
    H23: { name: 'black' },
    G4: { name: 'skin — light' },
    E12: { name: 'the pink I always reach for' },
  },
  demo: true,
  updatedAt: new Date().toISOString(),
};

await mkdir(dirname(OUT), { recursive: true });
if (!force) {
  try {
    await access(OUT);
    console.error(`Refusing to overwrite ${OUT}\nRe-run with --force if that is what you want.`);
    process.exit(1);
  } catch {
    // Does not exist: good.
  }
}
await writeFile(OUT, JSON.stringify(state, null, 2));
console.log(
  `Seeded ${OUT}\n  ${ledger.length} ledger entries · ${blueprints.length} blueprints · ${orders.length} orders`,
);
