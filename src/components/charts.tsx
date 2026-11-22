"use client";

import { useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";
import { signedMoney } from "@/lib/format";

/*
 * Single-series charts on the dark card surface (#12151c). The series colour
 * (iris #8e7dff) is validated: lightness band, chroma floor, ≥3:1 contrast.
 * Text always uses ink tokens, never the series colour. Hairline grid, 2px lines,
 * ≥8px markers with a 2px surface ring, hit targets ≥24px, and a table fallback.
 */
const SERIES = "#8e7dff";
const SURFACE = "#12151c";
const GRID = "rgb(255 255 255 / .07)";
const AXIS = "rgb(255 255 255 / .16)";
const INK_MUTED = "#959cae";

/** Rendered width of a container, kept in state via ResizeObserver (no ref reads during render). */
function useWidth(ref: RefObject<HTMLElement | null>, fallback: number) {
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width || fallback));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, fallback]);
  return w;
}

type Tip = { x: number; y: number; lines: [string, string][] } | null;

function Tooltip({ tip, width }: { tip: Tip; width: number }) {
  if (!tip) return null;
  const left = Math.min(Math.max(tip.x, 70), width - 70);
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-xl border border-white/10 bg-ink-800/95 px-3 py-2 text-xs shadow-xl backdrop-blur"
      style={{ left, top: tip.y - 10 }}
    >
      {tip.lines.map(([value, label], i) => (
        <div key={i} className="flex items-baseline gap-2 whitespace-nowrap">
          <span className="num text-sm font-semibold text-fg">{value}</span>
          <span className="text-muted">{label}</span>
        </div>
      ))}
    </div>
  );
}

/* ───────── Calibration: predicted confidence vs. how often it happened ───────── */

export type Bucket = { lo: number; hi: number; n: number; predicted: number; actual: number };

export function CalibrationChart({ buckets }: { buckets: Bucket[] }) {
  const box = useRef<HTMLDivElement>(null);
  // Coordinates follow the real pixel width so text stays 10px at any size.
  const W = Math.round(useWidth(box, 320));
  const H = Math.round(Math.min(280, Math.max(200, W * 0.62)));
  const pad = { l: 40, r: 14, t: 12, b: 30 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const x = (p: number) => pad.l + p * iw;
  const y = (p: number) => pad.t + (1 - p) * ih;
  const pts = buckets.filter((b) => b.n > 0);
  const [tip, setTip] = useState<Tip>(null);
  const width = W;
  const scale = () => 1;

  return (
    <div ref={box} className="relative" onPointerLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Calibration chart: predicted confidence versus actual hit rate">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke={GRID} />
            <text x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="10" fill={INK_MUTED} className="num">
              {t * 100}%
            </text>
          </g>
        ))}
        {[0, 0.5, 1].map((t) => (
          <text key={t} x={x(t)} y={H - 10} textAnchor="middle" fontSize="10" fill={INK_MUTED} className="num">
            {t * 100}%
          </text>
        ))}
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke={AXIS} />
        {/* perfect calibration reference */}
        <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke="rgb(255 255 255 / .22)" strokeWidth={1} />
        <text x={x(0.97)} y={y(0.97) + 14} textAnchor="end" fontSize="10" fill={INK_MUTED}>
          perfectly calibrated
        </text>
        {pts.length > 1 && (
          <polyline
            points={pts.map((b) => `${x(b.predicted)},${y(b.actual)}`).join(" ")}
            fill="none"
            stroke={SERIES}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {pts.map((b) => {
          const r = Math.min(9, 4 + Math.sqrt(b.n));
          const cx = x(b.predicted);
          const cy = y(b.actual);
          const show = () => {
            const s = scale();
            setTip({
              x: cx * s,
              y: cy * s,
              lines: [
                [`${Math.round(b.actual * 100)}%`, `came true`],
                [`${Math.round(b.predicted * 100)}%`, `avg confidence`],
                [`${b.n}`, b.n === 1 ? "call" : "calls"],
              ],
            });
          };
          return (
            <g key={b.lo} tabIndex={0} onPointerEnter={show} onFocus={show} onBlur={() => setTip(null)} className="cursor-default outline-none">
              <circle cx={cx} cy={cy} r={Math.max(12, r + 6)} fill="transparent" />
              <circle cx={cx} cy={cy} r={r} fill={SERIES} stroke={SURFACE} strokeWidth={2} />
            </g>
          );
        })}
      </svg>
      <Tooltip tip={tip} width={width} />
      <table className="sr-only">
        <caption>Calibration by confidence bucket</caption>
        <thead>
          <tr>
            <th>Confidence</th>
            <th>Calls</th>
            <th>Came true</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.lo}>
              <td>
                {b.lo}–{b.hi}%
              </td>
              <td>{b.n}</td>
              <td>{b.n ? `${Math.round(b.actual * 100)}%` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ───────── Cumulative profit over time (single series, crosshair) ───────── */

export function PnlChart({ points, tz }: { points: { t: number; v: number }[]; tz: string }) {
  const box = useRef<HTMLDivElement>(null);
  const width = useWidth(box, 560);
  const W = Math.round(width);
  const H = 200;
  const pad = { l: 52, r: 14, t: 14, b: 26 };
  const gid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);

  const series = useMemo(() => (points.length ? [{ t: points[0].t - 1, v: 0 }, ...points] : []), [points]);
  if (series.length < 2) return <p className="text-sm text-muted">No settled money bets yet.</p>;
  const t0 = series[0].t;
  const t1 = series[series.length - 1].t;
  const vs = series.map((p) => p.v);
  const lo = Math.min(0, ...vs);
  const hi = Math.max(0, ...vs);
  const span = hi - lo || 100;
  const step = niceStep(span / 3);
  const yMin = Math.floor(lo / step) * step;
  const yMax = Math.ceil(hi / step) * step || step;
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const x = (t: number) => pad.l + ((t - t0) / Math.max(1, t1 - t0)) * iw;
  const y = (v: number) => pad.t + (1 - (v - yMin) / (yMax - yMin)) * ih;
  const ticks: number[] = [];
  for (let v = yMin; v <= yMax + 1; v += step) ticks.push(v);
  const path = series.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  const area = `${path}L${x(t1)},${y(0)}L${x(t0)},${y(0)}Z`;
  const last = series[series.length - 1];
  const fmtDate = (t: number) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: tz }).format(t);

  const onMove = (e: React.PointerEvent) => {
    const rect = box.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 1;
    for (let i = 1; i < series.length; i++) if (Math.abs(x(series[i].t) - px) < Math.abs(x(series[best].t) - px)) best = i;
    setHover(best);
  };
  const h = hover !== null ? series[hover] : null;
  const s = width / W;

  return (
    <div ref={box} className="relative touch-pan-y" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Cumulative profit, now ${signedMoney(last.v)}`}>
        <defs>
          <linearGradient id={`pnl-${gid}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={SERIES} stopOpacity="0.16" />
            <stop offset="1" stopColor={SERIES} stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? AXIS : GRID} />
            <text x={pad.l - 8} y={y(v)} dy="0.32em" textAnchor="end" fontSize="10" fill={INK_MUTED} className="num">
              {v === 0 ? "$0" : signedMoney(v)}
            </text>
          </g>
        ))}
        <text x={pad.l} y={H - 6} fontSize="10" fill={INK_MUTED}>
          {fmtDate(points[0].t)}
        </text>
        <text x={W - pad.r} y={H - 6} fontSize="10" fill={INK_MUTED} textAnchor="end">
          {fmtDate(t1)}
        </text>
        <path d={area} fill={`url(#pnl-${gid})`} />
        <path d={path} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(last.t)} cy={y(last.v)} r={4.5} fill={SERIES} stroke={SURFACE} strokeWidth={2} />
        {h && (
          <>
            <line x1={x(h.t)} x2={x(h.t)} y1={pad.t} y2={H - pad.b} stroke="rgb(255 255 255 / .25)" />
            <circle cx={x(h.t)} cy={y(h.v)} r={5} fill={SERIES} stroke={SURFACE} strokeWidth={2} />
          </>
        )}
      </svg>
      {h && (
        <Tooltip
          tip={{ x: x(h.t) * s, y: y(h.v) * s, lines: [[signedMoney(h.v), `on ${fmtDate(h.t)}`]] }}
          width={width}
        />
      )}
    </div>
  );
}

function niceStep(raw: number) {
  const mag = 10 ** Math.floor(Math.log10(Math.max(1, raw)));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

/* ───────── Horizontal bars: win rate by category ───────── */

export function CategoryBars({ rows }: { rows: { label: string; value: number; n: number; detail: string }[] }) {
  const [tip, setTip] = useState<Tip>(null);
  const box = useRef<HTMLDivElement>(null);
  const width = useWidth(box, 300);
  if (rows.length === 0) return <p className="text-sm text-muted">No graded calls yet.</p>;
  return (
    <div ref={box} className="relative space-y-3" onPointerLeave={() => setTip(null)}>
      {rows.map((r) => {
        const show = (el: HTMLElement) => {
          const a = el.getBoundingClientRect();
          const b = box.current!.getBoundingClientRect();
          setTip({ x: a.left - b.left + a.width / 2, y: a.top - b.top, lines: [[`${Math.round(r.value * 100)}%`, "hit rate"], [r.detail, ""]] });
        };
        return (
          <div
            key={r.label}
            tabIndex={0}
            className="group grid grid-cols-[7.5rem_1fr_3rem] items-center gap-3 rounded-lg outline-none"
            onPointerEnter={(e) => show(e.currentTarget)}
            onFocus={(e) => show(e.currentTarget)}
            onBlur={() => setTip(null)}
          >
            <span className="truncate text-sm text-soft">{r.label}</span>
            <span className="relative h-3 rounded-r-[4px] bg-white/[0.05]">
              <span
                className="absolute inset-y-0 left-0 origin-left animate-grow rounded-r-[4px] transition-[filter] group-hover:brightness-125"
                style={{ width: `${r.value * 100}%`, background: SERIES }}
              />
            </span>
            <span className="num text-right text-sm text-fg">{Math.round(r.value * 100)}%</span>
          </div>
        );
      })}
      <Tooltip tip={tip} width={width} />
    </div>
  );
}

/* ───────── Sparkline (figure, no hover: values live in the row) ───────── */

export function Sparkline({ points, width = 96, height = 28 }: { points: { t: number; v: number }[]; width?: number; height?: number }) {
  if (points.length < 2) return <span className="inline-block text-xs text-faint">—</span>;
  const vs = [0, ...points.map((p) => p.v)];
  const lo = Math.min(...vs);
  const hi = Math.max(...vs);
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const x = (t: number) => 2 + ((t - t0) / Math.max(1, t1 - t0)) * (width - 6);
  const y = (v: number) => 3 + (1 - (v - lo) / Math.max(1, hi - lo)) * (height - 6);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  const last = points[points.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="overflow-visible">
      <line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke="rgb(255 255 255 / .1)" />
      <path d={d} fill="none" stroke="#5f6678" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last.t)} cy={y(last.v)} r={3} fill={last.v >= 0 ? "#34d399" : "#fb7185"} stroke={SURFACE} strokeWidth={1.5} />
    </svg>
  );
}
