import { useMemo } from "react";

type DayPoint = { date: string; total: number };

function dayLabel(value: string): string {
  const month = value.slice(5, 7);
  const day = value.slice(8, 10);
  return `${day}/${month}`;
}

export default function DownloadTrendChart({ data }: { data?: DayPoint[] }) {
  const points = useMemo(() => {
    const days = Array.isArray(data) ? data.slice(-7) : [];
    const max = Math.max(1, ...days.map(day => Number(day.total) || 0));
    return days.map((day, index) => ({
      ...day,
      x: days.length < 2 ? 350 : 40 + index * (620 / (days.length - 1)),
      y: 160 - ((Number(day.total) || 0) / max) * 125,
    }));
  }, [data]);
  const path = points.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ");
  const area = points.length ? `${path} L${points.at(-1)!.x},178 L${points[0].x},178 Z` : "";
  const total = points.reduce((sum, point) => sum + (Number(point.total) || 0), 0);

  return <section className="download-trend" aria-label="تنزيلات آخر 7 أيام">
    <div className="download-trend-heading"><div><span>النشاط اليومي</span><b>طلبات التنزيل · آخر 7 أيام</b></div><strong>{total.toLocaleString("ar-EG")} <small>تنزيل</small></strong></div>
    {total === 0 ? <div className="download-trend-empty">مفيش تنزيلات متسجلة في الفترة دي لسه.</div> : <div className="download-trend-chart" dir="ltr">
      <svg viewBox="0 0 700 205" role="img" aria-label={`إجمالي ${total} طلب تنزيل خلال سبعة أيام`} preserveAspectRatio="none">
        <defs><linearGradient id="download-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#00FF9C" stopOpacity=".25" /><stop offset="100%" stopColor="#00FF9C" stopOpacity="0" /></linearGradient></defs>
        {[35, 77, 119, 160].map(y => <line key={y} x1="40" x2="660" y1={y} y2={y} className="download-gridline" />)}
        {area && <path d={area} fill="url(#download-area)" />}
        {path && <path d={path} className="download-trend-line" />}
        {points.map(point => <g key={point.date}><circle cx={point.x} cy={point.y} r="4.5" className="download-trend-dot"><title>{dayLabel(point.date)}: {point.total}</title></circle></g>)}
      </svg>
      <div className="download-trend-labels">{points.map(point => <span key={point.date}>{dayLabel(point.date)}</span>)}</div>
    </div>}
  </section>;
}
