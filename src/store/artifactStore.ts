import { DEFAULT_SETTINGS, type AppState, type Blueprint, type LedgerEntry, type Order } from '../domain/types';
import type { StorageAdapter } from './types';
import { blobToDataUrl } from './image';

/**
 * Artifact-database adapter, used by the hosted copy of this app.
 *
 * The data is sharded rather than kept in one blob, because an Artifact
 * document is capped at 256 KiB and the ledger grows forever:
 *
 *   app/meta              settings, colour overrides, version
 *   ledger/<YYYY-MM>      that month's ledger entries, as one array
 *   blueprints/<id>       one document per blueprint
 *   orders/<id>           one document per delivery
 *
 * Month-bucketing the ledger keeps both the document count and each
 * document's size bounded, which one-document-per-entry would not.
 */

interface ClaudeRuntime {
  use(name: 'db'): Promise<ArtifactDb | null>;
  use(name: 'assets'): Promise<ArtifactAssets | null>;
}

interface ArtifactDocSnapshot {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}

interface ArtifactDocRef {
  get(): Promise<ArtifactDocSnapshot>;
  set(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
}

interface ArtifactCollectionRef {
  doc(id?: string): ArtifactDocRef;
  get(): Promise<{ docs: ArtifactDocSnapshot[] }>;
}

interface ArtifactDb {
  doc(path: string): ArtifactDocRef;
  collection(path: string): ArtifactCollectionRef;
}

interface ArtifactAssets {
  upload(blob: Blob): Promise<{ id: string; url: string }>;
}

function runtime(): ClaudeRuntime | null {
  const c = (globalThis as { claude?: ClaudeRuntime }).claude;
  return c && typeof c.use === 'function' ? c : null;
}

const monthOf = (date: string) => date.slice(0, 7) || 'unknown';

function bucketLedger(ledger: readonly LedgerEntry[]): Map<string, LedgerEntry[]> {
  const out = new Map<string, LedgerEntry[]>();
  for (const e of ledger) {
    const k = monthOf(e.date);
    const arr = out.get(k);
    if (arr) arr.push(e);
    else out.set(k, [e]);
  }
  return out;
}

export function createArtifactStore(): StorageAdapter {
  // Remember what was last written so a save only touches what changed.
  let lastWritten: AppState | null = null;

  const getDb = async (): Promise<ArtifactDb> => {
    const rt = runtime();
    const db = rt ? await rt.use('db') : null;
    if (!db) {
      throw new Error(
        'This page cannot reach its database. Sign in to claude.ai and reopen it, or use the local app.',
      );
    }
    return db;
  };

  return {
    label: 'Artifact database',
    location: 'claude.ai artifact store (export regularly)',

    async load(): Promise<AppState | null> {
      const db = await getDb();
      const [meta, ledgerDocs, bpDocs, orderDocs] = await Promise.all([
        db.doc('app/meta').get(),
        db.collection('ledger').get(),
        db.collection('blueprints').get(),
        db.collection('orders').get(),
      ]);

      const metaData = meta.exists ? (meta.data() ?? {}) : null;
      const ledger: LedgerEntry[] = [];
      for (const d of ledgerDocs.docs) {
        const entries = (d.data()?.entries as LedgerEntry[] | undefined) ?? [];
        ledger.push(...entries);
      }
      ledger.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

      const blueprints = bpDocs.docs
        .map((d) => d.data() as unknown as Blueprint)
        .filter((b): b is Blueprint => Boolean(b?.id));
      const orders = orderDocs.docs
        .map((d) => d.data() as unknown as Order)
        .filter((o): o is Order => Boolean(o?.id));

      if (!metaData && ledger.length === 0 && blueprints.length === 0) return null;

      const state: AppState = {
        version: 1,
        settings: { ...DEFAULT_SETTINGS, ...((metaData?.settings as object) ?? {}) },
        colorMeta: (metaData?.colorMeta as AppState['colorMeta']) ?? {},
        ledger,
        blueprints,
        orders,
        updatedAt: (metaData?.updatedAt as string) ?? new Date().toISOString(),
      };
      lastWritten = state;
      return state;
    },

    async save(state: AppState): Promise<void> {
      const db = await getDb();
      const prev = lastWritten;
      const writes: Promise<void>[] = [];

      const metaChanged =
        !prev ||
        JSON.stringify(prev.settings) !== JSON.stringify(state.settings) ||
        JSON.stringify(prev.colorMeta) !== JSON.stringify(state.colorMeta);
      if (metaChanged) {
        writes.push(
          db.doc('app/meta').set({
            version: 1,
            settings: state.settings,
            colorMeta: state.colorMeta,
            updatedAt: state.updatedAt,
          }),
        );
      }

      const nextBuckets = bucketLedger(state.ledger);
      const prevBuckets = prev ? bucketLedger(prev.ledger) : new Map<string, LedgerEntry[]>();
      for (const [month, entries] of nextBuckets) {
        const before = prevBuckets.get(month);
        if (!before || JSON.stringify(before) !== JSON.stringify(entries)) {
          writes.push(db.collection('ledger').doc(month).set({ month, entries }));
        }
      }
      for (const month of prevBuckets.keys()) {
        if (!nextBuckets.has(month)) writes.push(db.collection('ledger').doc(month).delete());
      }

      const prevBp = new Map((prev?.blueprints ?? []).map((b) => [b.id, b]));
      for (const bp of state.blueprints) {
        const before = prevBp.get(bp.id);
        if (!before || JSON.stringify(before) !== JSON.stringify(bp)) {
          writes.push(db.collection('blueprints').doc(bp.id).set(bp as unknown as Record<string, unknown>));
        }
        prevBp.delete(bp.id);
      }
      for (const id of prevBp.keys()) {
        writes.push(db.collection('blueprints').doc(id).delete());
      }

      const prevOrders = new Map((prev?.orders ?? []).map((o) => [o.id, o]));
      for (const o of state.orders) {
        const before = prevOrders.get(o.id);
        if (!before || JSON.stringify(before) !== JSON.stringify(o)) {
          writes.push(db.collection('orders').doc(o.id).set(o as unknown as Record<string, unknown>));
        }
        prevOrders.delete(o.id);
      }
      for (const id of prevOrders.keys()) {
        writes.push(db.collection('orders').doc(id).delete());
      }

      // Sequential: the store asks for one write at a time per document, and
      // this keeps a burst of edits from piling concurrent writes on a bucket.
      for (const w of writes) await w;
      lastWritten = state;
    },

    async uploadImage(blob: Blob): Promise<string> {
      const rt = runtime();
      const assets = rt ? await rt.use('assets') : null;
      if (assets) {
        const { url } = await assets.upload(blob);
        return url;
      }
      // Without the assets grant, inline it. Callers downscale first, but a
      // large data URL would not fit a 256 KiB document, so guard it.
      const dataUrl = await blobToDataUrl(blob);
      if (dataUrl.length > 180_000) {
        throw new Error('That image is too large to store inline. Try a smaller crop.');
      }
      return dataUrl;
    },
  };
}
