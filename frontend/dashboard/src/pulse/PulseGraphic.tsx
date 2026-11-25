import { useId, useState } from 'react';
import { colors, dollars } from '../common/finance';
import type { NodeType } from '../common/finance';
import type { PulseChart, Tone } from './pulse-models';
import { pulseDate } from './pulse-models';
const palette = [
  'var(--color-primary)',
  'var(--color-blue)',
  'var(--color-mint)',
  'var(--color-muted)',
];
export function PulseGraphic({
  chart,
  tone,
  active,
}: {
  chart?: PulseChart;
  tone: Tone;
  active: boolean;
}) {
  const id = useId().replace(/:/g, ''),
    [hover, setHover] = useState<number | null>(null);
  if (!chart)
    return (
      <div className="pulse-empty-art" aria-hidden="true">
        ✦
      </div>
    );
  if (chart.kind === 'allocation') {
    const total = chart.segments.reduce((s, p) => s + p.value, 0);
    return (
      <svg
        className="pulse-graphic"
        viewBox="0 0 160 52"
        role="img"
        aria-label="Portfolio allocation by priced value"
      >
        {chart.segments.map((p, i) => {
          const x =
            (chart.segments.slice(0, i).reduce((s, item) => s + item.value, 0) / total) * 160;
          const width = (p.value / total) * 160;
          return (
            <g key={p.label}>
              <rect
                x={x}
                y="13"
                width={Math.max(0, width - 2)}
                height="18"
                rx="3"
                fill={palette[i % 4]}
              />
              <title>
                {p.label}: {Math.round((p.value / total) * 100)}%
              </title>
            </g>
          );
        })}
        <text x="0" y="47" fill="var(--color-muted)" fontSize="8">
          {chart.segments.map((p) => p.label).join(' · ')}
        </text>
      </svg>
    );
  }
  if (chart.kind === 'nodes') {
    const positions = new Map(
      chart.nodes.map((n, i) => [n.id, { x: 16 + i * 31, y: i % 2 ? 34 : 14 }]),
    );
    return (
      <svg
        className="pulse-graphic"
        viewBox="0 0 160 52"
        role="img"
        aria-label="Preview of actual scenario nodes and connections"
      >
        {chart.edges.map((e, i) => {
          const a = positions.get(e.from)!,
            b = positions.get(e.to)!;
          return (
            <path
              key={i}
              className={active ? 'pulse-flow' : ''}
              d={`M${a.x},${a.y} C${(a.x + b.x) / 2},${a.y} ${(a.x + b.x) / 2},${b.y} ${b.x},${b.y}`}
              fill="none"
              stroke="var(--color-primary)"
              strokeWidth="1.2"
              strokeDasharray="3 4"
            />
          );
        })}
        {chart.nodes.map((n) => {
          const p = positions.get(n.id)!;
          return (
            <g key={n.id}>
              <circle
                cx={p.x}
                cy={p.y}
                r="9"
                fill="var(--color-raised)"
                stroke={colors[n.type as NodeType]}
              />
              <circle cx={p.x} cy={p.y} r="3" fill={colors[n.type as NodeType]} />
              <title>{n.type}</title>
            </g>
          );
        })}
      </svg>
    );
  }
  // Sampled evenly while retaining endpoints; normalized only chart coordinates, never the displayed amounts.
  const data = chart.points.filter(
    (_, i) =>
      i === 0 ||
      i === chart.points.length - 1 ||
      i % Math.max(1, Math.floor(chart.points.length / 60)) === 0,
  );
  if (!data.length) return null;
  const values = data.map((p) => p.value),
    min = Math.min(...values),
    span = Math.max(...values) - min;
  const coords = data.map((p, i) => ({
    x: 2 + (i / Math.max(1, data.length - 1)) * 156,
    y: span ? 44 - ((p.value - min) / span) * 36 : 26,
  }));
  const d = coords.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  const selected = hover === null ? null : coords[Math.min(hover, coords.length - 1)];
  const color =
    tone === 'positive'
      ? 'var(--color-mint)'
      : tone === 'negative'
        ? 'var(--color-coral)'
        : 'var(--color-primary)';
  return (
    <svg
      className="pulse-graphic"
      viewBox="0 0 160 52"
      role="img"
      aria-label={`Trend from ${data[0].label} to ${data.at(-1)!.label}`}
      onPointerMove={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        if (box.width <= 0) return;
        setHover(
          Math.max(
            0,
            Math.min(
              data.length - 1,
              Math.round(((event.clientX - box.left) / box.width) * (data.length - 1)),
            ),
          ),
        );
      }}
      onPointerLeave={() => setHover(null)}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor={color} stopOpacity=".24" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[10, 26, 42].map((y) => (
        <path
          key={y}
          d={`M0 ${y}H160`}
          stroke="var(--color-border)"
          strokeWidth=".65"
          strokeDasharray="2 4"
        />
      ))}
      <path d={`${d} L158 52 L2 52Z`} fill={`url(#${id})`} />
      <path
        className={active ? 'pulse-draw' : ''}
        pathLength="1"
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {selected && (
        <g>
          <path d={`M${selected.x} 0V52`} stroke="var(--color-muted)" strokeWidth=".6" />
          <circle
            cx={selected.x}
            cy={selected.y}
            r="2.6"
            fill={color}
            stroke="var(--color-surface)"
          />
          <title>
            {data[hover!].label}: {dollars(data[hover!].value)}
          </title>
          {/* Rendered the tracked observation inside the chart instead of relying on a delayed browser tooltip. */}
          <rect
            x="1"
            y="0"
            width="158"
            height="12"
            rx="2"
            fill="var(--color-surface)"
            opacity=".94"
          />
          <text x="4" y="8" fill="var(--color-text)" fontSize="8">
            {/^[0-9]{4}-/.test(data[hover!].label)
              ? pulseDate(data[hover!].label)
              : data[hover!].label}
            {' · '}
            {dollars(data[hover!].value)}
          </text>
        </g>
      )}
      {!selected && (
        <circle
          className={active ? 'pulse-endpoint' : ''}
          cx={coords.at(-1)!.x}
          cy={coords.at(-1)!.y}
          r="2.3"
          fill={color}
        />
      )}
    </svg>
  );
}
