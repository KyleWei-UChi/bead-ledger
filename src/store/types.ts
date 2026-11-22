import type { AppState } from '../domain/types';

/**
 * Everything the app needs from a backend. Implemented twice: once against the
 * local file server, once against the Artifact database. Keeping this interface
 * narrow is what makes the app portable, so your data is never trapped.
 */
export interface StorageAdapter {
  readonly label: string;
  /** Where the data physically lives, shown in Settings. */
  readonly location: string;
  load(): Promise<AppState | null>;
  save(state: AppState): Promise<void>;
  /** Returns a URL the app can put in an <img src>. */
  uploadImage(blob: Blob): Promise<string>;
}
