import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function Card({
  title,
  subtitle,
  right,
  children,
  className = '',
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-hairline bg-surface p-4 sm:p-5 ${className}`}
    >
      {(title || right) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-sm text-ink-2">{subtitle}</p>}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

type Variant = 'primary' | 'ghost' | 'danger' | 'subtle';

export function Button({
  variant = 'subtle',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const styles: Record<Variant, string> = {
    primary: 'bg-accent text-white hover:opacity-90',
    subtle: 'bg-surface-2 text-ink hover:bg-surface-2/70 border border-hairline',
    ghost: 'text-ink-2 hover:text-ink hover:bg-surface-2',
    danger: 'text-white hover:opacity-90',
  };
  return (
    <button
      {...rest}
      style={variant === 'danger' ? { background: 'var(--critical)' } : rest.style}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${styles[variant]} ${className}`}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium tracking-wide text-ink-2 uppercase">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-muted">{hint}</span>}
    </label>
  );
}

export function StatTile({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-hairline bg-surface p-4">
      <p className="text-xs font-medium tracking-wide text-ink-2 uppercase">{label}</p>
      <p
        className="mt-1.5 text-3xl leading-none font-semibold"
        style={tone ? { color: tone } : undefined}
      >
        {value}
      </p>
      {note && <p className="mt-1.5 text-sm text-ink-2">{note}</p>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-hairline p-6 text-center text-sm text-ink-2">
      {children}
    </div>
  );
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide = false,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`my-auto w-full rounded-xl border border-hairline bg-surface shadow-2xl ${
          wide ? 'max-w-3xl' : 'max-w-xl'
        }`}
      >
        <header className="flex items-start justify-between gap-3 border-b border-hairline p-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-ink-2">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded px-2 py-0.5 text-ink-muted hover:text-ink"
          >
            ✕
          </button>
        </header>
        <div className="p-4">{children}</div>
        {footer && (
          <footer className="flex flex-wrap justify-end gap-2 border-t border-hairline p-4">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

export function ImageDrop({
  value,
  onFile,
  busy,
}: {
  value?: string;
  onFile: (file: File) => void;
  busy?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      {value ? (
        <img
          src={value}
          alt="Blueprint"
          className="h-20 w-20 rounded-lg border border-hairline object-cover"
        />
      ) : (
        <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-hairline text-xs text-ink-muted">
          {busy ? '…' : 'no image'}
        </div>
      )}
      <label className="cursor-pointer">
        <span className="inline-flex items-center rounded-lg border border-hairline bg-surface-2 px-3 py-1.5 text-sm font-medium hover:opacity-80">
          {busy ? 'Processing…' : value ? 'Replace image' : 'Upload blueprint'}
        </span>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = '';
          }}
        />
      </label>
    </div>
  );
}
