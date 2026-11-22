import { hexFor } from '../lib/colors';
import { useAppStore } from '../store/useAppStore';

/**
 * A bead colour. The fill is the real bead hex; the code is always rendered
 * alongside or in the title, so colour never carries identity on its own.
 */
export function Swatch({
  code,
  size = 18,
  showCode = false,
  className = '',
}: {
  code: string;
  size?: number;
  showCode?: boolean;
  className?: string;
}) {
  const { state } = useAppStore();
  const hex = hexFor(code, state.colorMeta);
  const name = state.colorMeta[code]?.name;
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span
        className="swatch inline-block shrink-0 rounded-[3px]"
        style={{ width: size, height: size, background: hex }}
        title={`${code}${name ? ` · ${name}` : ''} ${hex}`}
        aria-hidden="true"
      />
      {showCode && <span className="tnum font-medium">{code}</span>}
    </span>
  );
}
