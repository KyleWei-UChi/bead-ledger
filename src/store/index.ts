import { createHttpStore } from './httpStore';
import type { StorageAdapter } from './types';

declare const __STORE_TARGET__: 'http' | 'artifact';
declare const __APP_VERSION__: string;

/** The release version, injected from package.json at build time. */
export const APP_VERSION: string =
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

/**
 * Chosen at build time. `npm run dev` / `npm run build` produce the local-file
 * build; `npm run build:artifact` produces the Artifact-database build.
 */
export const STORE_TARGET: 'http' | 'artifact' =
  typeof __STORE_TARGET__ === 'string' ? __STORE_TARGET__ : 'http';

let cached: StorageAdapter | null = null;

export async function getStore(): Promise<StorageAdapter> {
  if (cached) return cached;
  if (STORE_TARGET === 'artifact') {
    const { createArtifactStore } = await import('./artifactStore');
    cached = createArtifactStore();
  } else {
    cached = createHttpStore();
  }
  return cached;
}

export type { StorageAdapter } from './types';
