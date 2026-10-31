"use client";

/**
 * Small, dependency-free SVG charts that follow the app's light/dark tokens.
 *  - LineChart: values over time, crosshair + tooltip on hover
 *  - BarChart:  horizontal bars (one or two series), tooltip on hover, value at the end of each bar
 *  - ScoreRing: a match score as a ring
 * Every chart has a legend when it shows two or more series, and a "Show data table" view.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

export interface Series {
  name: string;
  /** CSS colour, usually one of the chart tokens: var(--series-1) … */
  color: string;
  values: number[];
}

/** A rounded axis maximum and tick step that give about four gridlines. */
function niceScale(max: number): { max: number; step: number } {
  if (max <= 4) return { max: Math.max(2, Math.ceil(max)), step: 1 };
  const rough = max / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((st) => st >= rough)!;
  return { max: Math.ceil(max / step) * step, step };
}
function niceMax(max: number): number {
  return niceScale(max).max;
}
function ticks(max: number): number[] {
  const { step } = niceScale(max);
  const out: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export function Legend({ series }: { series: { name: string; color: string }[] }) {
  if (series.length < 2) return null;
  return (
    <div className="flex flex-wrap justify-end gap-x-4 gap-y-1 text-xs text-ink-2">
      {series.map((s) => (
        <span key={s.name} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} /> {s.name}
        </span>
      ))}
    </div>
  );
}

export function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="group mt-3 text-sm">
      <summary className="cursor-pointer select-none text-ink hover:text-brand">
        <span className="group-open:hidden">Show data table</span>
        <span className="hidden group-open:inline">Hide data table</span>
      </summary>
      <div className="mt-2 max-h-64 overflow-auto rounded-md border border-line">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-panel-2 text-ink-2">
            <tr>{head.map((h, i) => <th key={h} className={`px-3 py-2 font-semibold ${i ? "text-right" : ""}`}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-line">
                {r.map((c, j) => <td key={j} className={`px-3 py-1.5 ${j ? "text-right tabular-nums" : ""}`}>{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const flip = x > width - 170;
  return (
    <div className="pointer-events-none absolute z-10 min-w-36 rounded-md border border-line bg-panel px-3 py-2 text-xs shadow-lg"
      style={{ left: flip ? undefined : x + 12, right: flip ? width - x + 12 : undefined, top: Math.max(0, y - 10) }}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ line chart */
export function LineChart({ labels, series, height = 240, unit = "reports" }: { labels: string[]; series: Series[]; height?: number; unit?: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 30, r: 22, t: 12, b: 26 };
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const w = Math.max(width - pad.l - pad.r, 10);
  const h = height - pad.t - pad.b;
  const x = (i: number) => pad.l + (labels.length < 2 ? w / 2 : (i * w) / (labels.length - 1));
  const y = (v: number) => pad.t + h - (v / max) * h;
  const every = Math.ceil(labels.length / Math.max(1, Math.floor(w / 52)));

  function onMove(e: React.MouseEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = e.clientX - rect.left;
    setHover(Math.max(0, Math.min(labels.length - 1, Math.round((rel / rect.width) * (labels.length - 1)))));
  }

  return (
    <div>
      <Legend series={series} />
      <div ref={ref} className="relative mt-2" style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={`${series.map((s) => s.name).join(" and ")} ${unit} per day`}>
            {ticks(max).map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
                <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className="fill-ink-2 text-[11px]">{t}</text>
              </g>
            ))}
            {labels.map((l, i) => ((i % every === 0 && labels.length - 1 - i >= every * 0.7) || i === labels.length - 1) && (
              <text key={l + i} x={x(i)} y={height - 6} textAnchor={i === labels.length - 1 ? "end" : i === 0 ? "start" : "middle"} className="fill-ink-2 text-[11px]">{l}</text>
            ))}
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + h} stroke="var(--ink-3)" strokeWidth={1} />}
            {series.map((s) => (
              <g key={s.name}>
                <polyline fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
                  points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
                {s.values.map((v, i) => (
                  <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 5 : 3.5} fill={s.color} stroke="var(--panel)" strokeWidth={2} />
                ))}
              </g>
            ))}
            <rect x={pad.l} y={pad.t} width={w} height={h} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
          </svg>
        )}
        {hover !== null && (
          <Tooltip x={x(hover)} y={Math.min(...series.map((s) => y(s.values[hover]!)))} width={width}>
            <p className="mb-1 font-semibold text-ink">{labels[hover]}</p>
            {series.map((s) => (
              <p key={s.name} className="flex items-center gap-2 text-ink-2">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                <span className="flex-1">{s.name}</span>
                <b className="tabular-nums text-ink">{s.values[hover]}</b>
              </p>
            ))}
          </Tooltip>
        )}
      </div>
      <DataTable head={["Day", ...series.map((s) => s.name)]} rows={labels.map((l, i) => [l, ...series.map((s) => s.values[i] ?? 0)])} />
    </div>
  );
}

/* ------------------------------------------------------------------ horizontal bar chart */
export function BarChart({ labels, series, empty = "No data yet" }: { labels: string[]; series: Series[]; empty?: string }) {
  const [tip, setTip] = useState<{ x: number; y: number; row: number } | null>(null);
  const [ref, width] = useWidth<HTMLDivElement>();
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const total = series.flatMap((s) => s.values).reduce((a, b) => a + b, 0);
  if (!labels.length || total === 0) return <p className="py-10 text-center text-sm text-ink-3">{empty}</p>;
  const barH = series.length > 1 ? 12 : 16;

  return (
    <div>
      <Legend series={series} />
      <div ref={ref} className="relative mt-2" onMouseLeave={() => setTip(null)}>
        <div className="grid grid-cols-[minmax(5rem,auto)_1fr] gap-x-3">
          {labels.map((label, row) => (
            <div key={label} className="contents">
              <span className="flex items-center justify-end py-2 text-right text-xs text-ink-2">{label}</span>
              <div className="relative flex flex-col justify-center gap-[2px] py-2"
                onMouseMove={(e) => {
                  const box = ref.current!.getBoundingClientRect();
                  setTip({ x: e.clientX - box.left, y: e.clientY - box.top, row });
                }}>
                {ticks(max).slice(1).map((t) => (
                  <span key={t} className="absolute inset-y-0 w-px bg-line" style={{ left: `${(t / max) * 100}%` }} aria-hidden />
                ))}
                {series.map((s) => {
                  const v = s.values[row] ?? 0;
                  return (
                    <div key={s.name} className="relative flex items-center gap-1.5" style={{ height: barH }}>
                      <span className="h-full rounded-r-[4px] transition-[width] duration-500"
                        style={{ width: `${(v / max) * 100}%`, minWidth: v ? 3 : 0, background: s.color }} />
                      <span className="text-[11px] tabular-nums text-ink-2">{v}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <span />
          <div className="relative h-5 text-[11px] text-ink-3">
            {ticks(max).map((t) => (
              <span key={t} className="absolute -translate-x-1/2" style={{ left: `${(t / max) * 100}%` }}>{t}</span>
            ))}
          </div>
        </div>
        {tip && (
          <Tooltip x={tip.x} y={tip.y} width={width}>
            <p className="mb-1 font-semibold text-ink">{labels[tip.row]}</p>
            {series.map((s) => (
              <p key={s.name} className="flex items-center gap-2 text-ink-2">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                <span className="flex-1">{s.name}</span>
                <b className="tabular-nums text-ink">{s.values[tip.row]}</b>
              </p>
            ))}
          </Tooltip>
        )}
      </div>
      <DataTable head={["", ...series.map((s) => s.name)]} rows={labels.map((l, i) => [l, ...series.map((s) => s.values[i] ?? 0)])} />
    </div>
  );
}

/* ------------------------------------------------------------------ score ring */
export function ScoreRing({ score, size = 48 }: { score: number; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const color = score >= 80 ? "#22c55e" : score >= 60 ? "#facc15" : "#fb923c";
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Match score ${score} out of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={4} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={4} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">{score}<span className="text-[9px]">%</span></span>
    </span>
  );
}
