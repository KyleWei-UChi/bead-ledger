import { useEffect, useState } from 'react';
import { Blueprints } from './components/Blueprints';
import { Dashboard } from './components/Dashboard';
import { Orders } from './components/Orders';
import { SettingsPanel } from './components/SettingsPanel';
import { StockTable } from './components/StockTable';
import { emptyState } from './domain/types';
import { STORE_TARGET } from './store';
import { useAppStore } from './store/useAppStore';

type Tab = 'dashboard' | 'stock' | 'blueprints' | 'orders' | 'settings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'stock', label: 'Stock' },
  { id: 'blueprints', label: 'Blueprints' },
  { id: 'orders', label: 'Orders' },
  { id: 'settings', label: 'Settings' },
];

type Theme = 'system' | 'light' | 'dark';

export function App() {
  const { state, replace, loading, loadError, saveState, saveError } = useAppStore();
  const [clearing, setClearing] = useState(false);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [focusCode, setFocusCode] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem('bead.theme') as Theme | null) ?? 'system',
  );

  // Inside an Artifact the viewer's own light/dark control writes
  // `data-theme`, so the page must not touch it — a second switch would fight
  // the host's and clear the viewer's choice. The tokens follow it either way.
  const ownsTheme = STORE_TARGET !== 'artifact';

  useEffect(() => {
    if (!ownsTheme) return;
    try {
      localStorage.setItem('bead.theme', theme);
    } catch {
      // Private browsing: the preference just will not persist.
    }
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme, ownsTheme]);

  const goToColor = (code: string) => {
    setFocusCode(code);
    setTab('stock');
  };

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-40 border-b border-hairline bg-plane/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <span className="inline-grid grid-cols-2 gap-0.5" aria-hidden="true">
              <span className="h-2 w-2 rounded-[1px]" style={{ background: '#F4D738' }} />
              <span className="h-2 w-2 rounded-[1px]" style={{ background: '#D03B3B' }} />
              <span className="h-2 w-2 rounded-[1px]" style={{ background: '#2A78D6' }} />
              <span className="h-2 w-2 rounded-[1px]" style={{ background: '#1BAF7A' }} />
            </span>
            Bead Ledger
            <span className="hidden font-normal text-ink-muted sm:inline">MARD 221</span>
          </h1>

          <nav className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto sm:order-none sm:mx-0 sm:w-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? 'page' : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
                  tab === t.id
                    ? 'bg-surface-2 text-ink'
                    : 'text-ink-2 hover:bg-surface-2/60 hover:text-ink'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <SaveBadge state={saveState} error={saveError} />
            {ownsTheme && (
              <select
              className="rounded-lg border border-hairline bg-surface px-2 py-1 text-xs text-ink-2"
              value={theme}
              onChange={(e) => setTheme(e.target.value as Theme)}
              aria-label="Theme"
            >
              <option value="system">Auto</option>
              <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5">
        {state.demo && !loading && (
          <div
            className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border p-3 text-sm"
            style={{ borderColor: 'var(--warning)' }}
          >
            <span className="font-medium" style={{ color: 'var(--warning)' }}>
              ◐ These are made-up numbers
            </span>
            <span className="text-ink-2">
              Sample history so the charts have something to show. Clear it before entering your
              own stock.
            </span>
            {clearing ? (
              <span className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-lg px-2.5 py-1 text-xs font-medium text-white"
                  style={{ background: 'var(--critical)' }}
                  onClick={() => {
                    replace(emptyState());
                    setClearing(false);
                  }}
                >
                  Delete all of it
                </button>
                <button
                  type="button"
                  className="text-xs text-ink-2 hover:text-ink"
                  onClick={() => setClearing(false)}
                >
                  Keep it
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="ml-auto rounded-lg border border-hairline px-2.5 py-1 text-xs font-medium hover:bg-surface-2"
                onClick={() => setClearing(true)}
              >
                Start fresh
              </button>
            )}
          </div>
        )}

        {loadError && (
          <div
            className="mb-4 rounded-xl border p-4 text-sm"
            style={{ borderColor: 'var(--critical)' }}
          >
            <p className="font-semibold" style={{ color: 'var(--critical)' }}>
              ▲ Could not load your data
            </p>
            <p className="mt-1 text-ink-2">{loadError}</p>
            <p className="mt-1 text-ink-muted">
              {STORE_TARGET === 'artifact'
                ? 'Sign in to claude.ai and reload this page. If it still fails, the local app is the reference copy of your data.'
                : 'Check that the data server is up — it starts alongside the web app with npm run dev.'}
            </p>
          </div>
        )}

        {loading ? (
          <p className="py-20 text-center text-sm text-ink-muted">Loading your ledger…</p>
        ) : (
          <>
            {tab === 'dashboard' && <Dashboard onPickColor={goToColor} />}
            {tab === 'stock' && <StockTable focusCode={focusCode} />}
            {tab === 'blueprints' && <Blueprints />}
            {tab === 'orders' && <Orders />}
            {tab === 'settings' && <SettingsPanel />}
          </>
        )}
      </main>
    </div>
  );
}

function SaveBadge({ state, error }: { state: string; error: string | null }) {
  if (state === 'error') {
    return (
      <span className="text-xs" style={{ color: 'var(--critical)' }} title={error ?? ''}>
        ▲ not saved
      </span>
    );
  }
  if (state === 'saving') return <span className="text-xs text-ink-muted">saving…</span>;
  if (state === 'saved') return <span className="text-xs text-ink-muted">✓ saved</span>;
  return null;
}
