import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Small SVG charts, no library.
 *
 * Palette: categorical slots 1 (blue) and 2 (orange), validated against this
 * app's own light and dark card surfaces — worst adjacent CVD ΔE 24.7 light /
 * 26.8 dark, well clear of the ≥8 gate. Marks follow the house specs: bars
 * capped at 24px with a 4px rounded data-end square to the baseline, a 2px
 * surface gap between stacked segments, 2px lines, 8px end markers with a 2px
 * surface ring, hairline solid gridlines. Every chart carries a hover tooltip
 * and a table view, so no value is reachable by colour alone.
 */

const PAD = { top: 14, right: 12, bottom: 26, left: 46 };
const HEIGHT = 190;
const MAX_BAR = 24;
const RADIUS = 4;
const GAP = 2;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Rounded at the data end, square at the baseline. */
export function barPath(x: number, y: number, w: number, h: number, round: boolean): string {
  if (h <= 0) return "";
  const r = round ? Math.min(RADIUS, h, w / 2) : 0;
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}

/** Clean axis ceiling: 1/2/5 × a power of ten. */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (value <= step * pow) return step * pow;
  }
  return 10 * pow;
}

export function ticks(max: number, count = 4): number[] {
  return Array.from({ length: count + 1 }, (_, i) => (max / count) * i);
}

const MONTH_INITIALS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

export interface ChartRow {
  key: string;
  label: string;
  values: number[];
}

function Frame({
  title,
  subtitle,
  legend,
  children,
  table,
}: {
  title: string;
  subtitle?: string;
  legend?: { name: string; className: string }[];
  children: ReactNode;
  table: ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <div className="card chart">
      <div className="row-between">
        <div>
          <strong>{title}</strong>
          {subtitle && <div className="item-sub">{subtitle}</div>}
        </div>
        <button className="btn-sm" onClick={() => setShowTable((v) => !v)}>
          {showTable ? "Grafiek" : "Tabel"}
        </button>
      </div>
      {legend && legend.length > 1 && (
        <div className="chart-legend">
          {legend.map((l) => (
            <span key={l.name}>
              <i className={l.className} />
              {l.name}
            </span>
          ))}
        </div>
      )}
      {showTable ? <div className="table-scroll">{table}</div> : children}
    </div>
  );
}

function Tooltip({ x, width, children }: { x: number; width: number; children: ReactNode }) {
  // Keep the bubble inside the plot rather than letting it run off an edge.
  const side = x > width / 2 ? "right" : "left";
  const style = side === "left" ? { left: x + 10 } : { right: width - x + 10 };
  return (
    <div className="chart-tip" style={style}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stacked columns — revenue split between own clients and IN FORM     */
/* ------------------------------------------------------------------ */

export function StackedColumns({
  title,
  subtitle,
  rows,
  names,
  format,
}: {
  title: string;
  subtitle?: string;
  rows: ChartRow[];
  names: [string, string];
  format: (n: number) => string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const totals = rows.map((r) => r.values[0] + r.values[1]);
  const max = niceMax(Math.max(...totals, 0));
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const band = rows.length > 0 ? plotW / rows.length : 0;
  const barW = Math.min(MAX_BAR, band * 0.62);
  const scale = (v: number) => (max > 0 ? (v / max) * plotH : 0);

  // Label only the tallest column, so the direct label stays meaningful.
  const peak = totals.indexOf(Math.max(...totals));

  return (
    <Frame
      title={title}
      subtitle={subtitle}
      legend={[
        { name: names[0], className: "s1" },
        { name: names[1], className: "s2" },
      ]}
      table={
        <table className="datatable">
          <thead>
            <tr>
              <th>Maand</th>
              <th>{names[0]}</th>
              <th>{names[1]}</th>
              <th>Totaal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key}>
                <td>{r.label}</td>
                <td>{format(r.values[0])}</td>
                <td>{format(r.values[1])}</td>
                <td>{format(totals[i])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div className="chart-plot" ref={ref}>
        {width > 0 && (
          <svg width={width} height={HEIGHT} role="img" aria-label={title}>
            {ticks(max).map((t) => {
              const y = PAD.top + plotH - scale(t);
              return (
                <g key={t}>
                  <line className="grid" x1={PAD.left} x2={width - PAD.right} y1={y} y2={y} />
                  <text className="tick" x={PAD.left - 8} y={y + 3.5} textAnchor="end">
                    {format(t)}
                  </text>
                </g>
              );
            })}

            {rows.map((r, i) => {
              const cx = PAD.left + band * i + band / 2;
              const x = cx - barW / 2;
              const base = PAD.top + plotH;
              const hOwn = scale(r.values[0]);
              const hInf = scale(r.values[1]);
              // The 2px gap is carved out of the lower segment.
              const ownH = hInf > 0 ? Math.max(0, hOwn - GAP) : hOwn;
              const total = totals[i];
              return (
                <g key={r.key} opacity={hover === null || hover === i ? 1 : 0.45}>
                  <path className="s1" d={barPath(x, base - ownH, barW, ownH, hInf <= 0)} />
                  <path className="s2" d={barPath(x, base - hOwn - hInf, barW, hInf, true)} />
                  {i === peak && total > 0 && (
                    <text
                      className="value"
                      x={cx}
                      y={base - hOwn - hInf - 6}
                      textAnchor="middle"
                    >
                      {format(total)}
                    </text>
                  )}
                  <text className="tick" x={cx} y={HEIGHT - 8} textAnchor="middle">
                    {r.label}
                  </text>
                  <rect
                    x={PAD.left + band * i}
                    y={PAD.top}
                    width={band}
                    height={plotH}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                  />
                </g>
              );
            })}
            <line
              className="axis"
              x1={PAD.left}
              x2={width - PAD.right}
              y1={PAD.top + plotH}
              y2={PAD.top + plotH}
            />
          </svg>
        )}
        {hover !== null && (
          <Tooltip x={PAD.left + band * hover + band / 2} width={width}>
            <strong>{rows[hover].label}</strong>
            <span>
              <i className="s1" />
              {names[0]} {format(rows[hover].values[0])}
            </span>
            <span>
              <i className="s2" />
              {names[1]} {format(rows[hover].values[1])}
            </span>
            <span className="muted">Totaal {format(totals[hover])}</span>
          </Tooltip>
        )}
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/* Single-series columns                                               */
/* ------------------------------------------------------------------ */

export function Columns({
  title,
  subtitle,
  rows,
  valueName,
  format,
}: {
  title: string;
  subtitle?: string;
  rows: ChartRow[];
  valueName: string;
  format: (n: number) => string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const values = rows.map((r) => r.values[0]);
  const max = niceMax(Math.max(...values, 0));
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const band = rows.length > 0 ? plotW / rows.length : 0;
  const barW = Math.min(MAX_BAR, band * 0.62);
  const scale = (v: number) => (max > 0 ? (v / max) * plotH : 0);
  const peak = values.indexOf(Math.max(...values));

  return (
    <Frame
      title={title}
      subtitle={subtitle}
      table={
        <table className="datatable">
          <thead>
            <tr>
              <th>Maand</th>
              <th>{valueName}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>{r.label}</td>
                <td>{format(r.values[0])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div className="chart-plot" ref={ref}>
        {width > 0 && (
          <svg width={width} height={HEIGHT} role="img" aria-label={title}>
            {ticks(max).map((t) => {
              const y = PAD.top + plotH - scale(t);
              return (
                <g key={t}>
                  <line className="grid" x1={PAD.left} x2={width - PAD.right} y1={y} y2={y} />
                  <text className="tick" x={PAD.left - 8} y={y + 3.5} textAnchor="end">
                    {format(t)}
                  </text>
                </g>
              );
            })}
            {rows.map((r, i) => {
              const cx = PAD.left + band * i + band / 2;
              const h = scale(r.values[0]);
              const base = PAD.top + plotH;
              return (
                <g key={r.key} opacity={hover === null || hover === i ? 1 : 0.45}>
                  <path className="s1" d={barPath(cx - barW / 2, base - h, barW, h, true)} />
                  {i === peak && r.values[0] > 0 && (
                    <text className="value" x={cx} y={base - h - 6} textAnchor="middle">
                      {format(r.values[0])}
                    </text>
                  )}
                  <text className="tick" x={cx} y={HEIGHT - 8} textAnchor="middle">
                    {r.label}
                  </text>
                  <rect
                    x={PAD.left + band * i}
                    y={PAD.top}
                    width={band}
                    height={plotH}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                  />
                </g>
              );
            })}
            <line
              className="axis"
              x1={PAD.left}
              x2={width - PAD.right}
              y1={PAD.top + plotH}
              y2={PAD.top + plotH}
            />
          </svg>
        )}
        {hover !== null && (
          <Tooltip x={PAD.left + band * hover + band / 2} width={width}>
            <strong>{rows[hover].label}</strong>
            <span>
              {valueName} {format(rows[hover].values[0])}
            </span>
          </Tooltip>
        )}
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/* Line                                                                */
/* ------------------------------------------------------------------ */

export function LineTrend({
  title,
  subtitle,
  rows,
  valueName,
  format,
}: {
  title: string;
  subtitle?: string;
  rows: ChartRow[];
  valueName: string;
  format: (n: number) => string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const values = rows.map((r) => r.values[0]);
  const max = niceMax(Math.max(...values, 0));
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const band = rows.length > 0 ? plotW / rows.length : 0;
  const scale = (v: number) => (max > 0 ? (v / max) * plotH : 0);
  const px = (i: number) => PAD.left + band * i + band / 2;
  const py = (v: number) => PAD.top + plotH - scale(v);

  const d = rows.map((r, i) => `${i === 0 ? "M" : "L"}${px(i)},${py(r.values[0])}`).join(" ");
  const last = rows.length - 1;

  return (
    <Frame
      title={title}
      subtitle={subtitle}
      table={
        <table className="datatable">
          <thead>
            <tr>
              <th>Maand</th>
              <th>{valueName}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>{r.label}</td>
                <td>{format(r.values[0])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div className="chart-plot" ref={ref}>
        {width > 0 && (
          <svg width={width} height={HEIGHT} role="img" aria-label={title}>
            {ticks(max).map((t) => {
              const y = py(t);
              return (
                <g key={t}>
                  <line className="grid" x1={PAD.left} x2={width - PAD.right} y1={y} y2={y} />
                  <text className="tick" x={PAD.left - 8} y={y + 3.5} textAnchor="end">
                    {format(t)}
                  </text>
                </g>
              );
            })}

            {hover !== null && (
              <line
                className="crosshair"
                x1={px(hover)}
                x2={px(hover)}
                y1={PAD.top}
                y2={PAD.top + plotH}
              />
            )}

            <path className="line s1" d={d} />

            {/* End marker: 8px dot with a 2px surface ring. */}
            {rows.length > 0 && (
              <>
                <circle className="ring" cx={px(last)} cy={py(values[last])} r={6} />
                <circle className="dot s1" cx={px(last)} cy={py(values[last])} r={4} />
              </>
            )}
            {hover !== null && hover !== last && (
              <>
                <circle className="ring" cx={px(hover)} cy={py(values[hover])} r={6} />
                <circle className="dot s1" cx={px(hover)} cy={py(values[hover])} r={4} />
              </>
            )}

            {rows.map((r, i) => (
              <g key={r.key}>
                <text className="tick" x={px(i)} y={HEIGHT - 8} textAnchor="middle">
                  {r.label}
                </text>
                <rect
                  x={PAD.left + band * i}
                  y={PAD.top}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                />
              </g>
            ))}
            <line
              className="axis"
              x1={PAD.left}
              x2={width - PAD.right}
              y1={PAD.top + plotH}
              y2={PAD.top + plotH}
            />
          </svg>
        )}
        {hover !== null && (
          <Tooltip x={px(hover)} width={width}>
            <strong>{rows[hover].label}</strong>
            <span>
              {valueName} {format(rows[hover].values[0])}
            </span>
          </Tooltip>
        )}
      </div>
    </Frame>
  );
}

export function monthLabel(index: number): string {
  return MONTH_INITIALS[index];
}
