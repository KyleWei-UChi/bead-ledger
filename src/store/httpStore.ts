import type { AppState } from '../domain/types';
import type { StorageAdapter } from './types';

export function createHttpStore(): StorageAdapter {
  return {
    label: 'Local file',
    location: 'data/beads.json',

    async load() {
      const res = await fetch('/api/state');
      if (!res.ok) throw new Error(`Could not load state (HTTP ${res.status})`);
      return (await res.json()) as AppState | null;
    },

    async save(state: AppState) {
      const res = await fetch('/api/state', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(state, null, 2),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`Could not save (HTTP ${res.status}) ${detail}`);
      }
    },

    async uploadImage(blob: Blob) {
      const res = await fetch('/api/images', {
        method: 'POST',
        headers: { 'content-type': blob.type || 'image/jpeg' },
        body: blob,
      });
      if (!res.ok) throw new Error(`Image upload failed (HTTP ${res.status})`);
      const { url } = (await res.json()) as { url: string };
      return url;
    },
  };
}
