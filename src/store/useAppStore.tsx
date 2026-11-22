import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { emptyState, type AppState } from '../domain/types';
import { getStore } from './index';
import type { StorageAdapter } from './types';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface StoreValue {
  state: AppState;
  /** Apply a pure transform and persist it. */
  update: (fn: (prev: AppState) => AppState) => void;
  /** Replace everything, e.g. after importing a file. */
  replace: (next: AppState) => void;
  loading: boolean;
  loadError: string | null;
  saveState: SaveState;
  saveError: string | null;
  adapter: StorageAdapter | null;
  uploadImage: (blob: Blob) => Promise<string>;
}

const Ctx = createContext<StoreValue | null>(null);

const SAVE_DEBOUNCE_MS = 500;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => emptyState());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [adapter, setAdapter] = useState<StorageAdapter | null>(null);

  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<AppState | null>(null);
  // Guard against persisting the placeholder state before the real load lands.
  const ready = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const store = await getStore();
        if (cancelled) return;
        setAdapter(store);
        const loaded = await store.load();
        if (cancelled) return;
        setState(loaded ?? emptyState());
      } catch (err) {
        if (!cancelled) setLoadError(String((err as Error)?.message ?? err));
      } finally {
        if (!cancelled) {
          ready.current = true;
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const flush = useCallback(async () => {
    const next = pending.current;
    if (!next) return;
    pending.current = null;
    setSaveState('saving');
    try {
      const store = await getStore();
      await store.save(next);
      setSaveState('saved');
      setSaveError(null);
    } catch (err) {
      setSaveState('error');
      setSaveError(String((err as Error)?.message ?? err));
    }
  }, []);

  const schedule = useCallback(
    (next: AppState) => {
      if (!ready.current) return;
      pending.current = next;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
    },
    [flush],
  );

  const update = useCallback(
    (fn: (prev: AppState) => AppState) => {
      setState((prev) => {
        const next = fn(prev);
        if (next !== prev) schedule(next);
        return next;
      });
    },
    [schedule],
  );

  const replace = useCallback(
    (next: AppState) => {
      setState(next);
      schedule(next);
    },
    [schedule],
  );

  // Don't lose the last few hundred milliseconds of edits on a tab close.
  useEffect(() => {
    const onHide = () => {
      if (pending.current) void flush();
    };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [flush]);

  const uploadImage = useCallback(async (blob: Blob) => {
    const store = await getStore();
    return store.uploadImage(blob);
  }, []);

  const value = useMemo<StoreValue>(
    () => ({
      state,
      update,
      replace,
      loading,
      loadError,
      saveState,
      saveError,
      adapter,
      uploadImage,
    }),
    [state, update, replace, loading, loadError, saveState, saveError, adapter, uploadImage],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppStore(): StoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppStore must be used inside <StoreProvider>');
  return v;
}
