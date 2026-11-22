/**
 * A per-colour consumption trace. Deliberately unlabelled and tiny: it answers
 * "is this picking up or dying off?" inside a table row, nothing more.
 */
export function Sparkline({
  values,
  width = 92,
  height = 22,
  stroke = 'var(--accent)',
}: {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
}) {
  if (values.length < 2) {
    return <span className="text-xs text-ink-muted">—</span>;
  }
  const max = Math.max(...values, 1);
  const stepX = width / (values.length - 1);
  const y = (v: number) => height - 2 - (v / max) * (height - 4);
  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * stepX).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  const last = values[values.length - 1]!;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Recent consumption trend, latest ${Math.round(last)} beads`}
      className="overflow-visible"
    >
      <path d={area} fill={stroke} opacity={0.14} />
      <path d={line} fill="none" stroke={stroke} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={width} cy={y(last)} r={2.5} fill={stroke} />
    </svg>
  );
}
