import { useState, type KeyboardEvent } from "react";

type ActivityPoint = {
  day: string;
  users: number;
  bookings: number;
  revenue: number;
};

type Metric = "bookings" | "users" | "revenue";

const metrics: Array<{ id: Metric; label: string; color: string }> = [
  { id: "bookings", label: "الحجوزات", color: "#00FF9C" },
  { id: "users", label: "مستخدمون جدد", color: "#4DB6FF" },
  { id: "revenue", label: "إيراد مؤكد", color: "#FFB547" },
];

const numberFormat = new Intl.NumberFormat("ar-EG");
const currencyFormat = new Intl.NumberFormat("ar-EG", {
  style: "currency",
  currency: "EGP",
  maximumFractionDigits: 0,
});
const shortDate = (day: string) => new Intl.DateTimeFormat("ar-EG", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
}).format(new Date(`${day}T00:00:00Z`));
const longDate = (day: string) => new Intl.DateTimeFormat("ar-EG", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
}).format(new Date(`${day}T00:00:00Z`));

export default function AdminActivityChart({ data }: { data: ActivityPoint[] }) {
  const [metric, setMetric] = useState<Metric>("bookings");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const points = Array.isArray(data) ? data.slice(-7) : [];
  const currentMetric = metrics.find(item => item.id === metric) || metrics[0];
  const selectedPoint = points.find(point => point.day === selectedDay) || points[points.length - 1];
  const values = points.map(point => Math.max(0, Number(point[metric]) || 0));
  const maxValue = Math.max(1, ...values);
  const allZero = values.length > 0 && values.every(value => value === 0);
  const width = 700;
  const height = 232;
  const left = 24;
  const right = 16;
  const top = 18;
  const bottom = 42;
  const plotHeight = height - top - bottom;
  const slotWidth = points.length ? (width - left - right) / points.length : 0;
  const barWidth = Math.min(46, slotWidth * 0.56);

  const selectByKeyboard = (event: KeyboardEvent<SVGGElement>, day: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelectedDay(day);
    }
  };

  return <section className="activity-chart-card" aria-labelledby="activity-chart-title">
    <div className="activity-chart-head">
      <div><span className="overline">LIVE DATA · 7 DAYS</span><h3 id="activity-chart-title">حركة المنصة</h3></div>
      <div className="activity-chart-controls" role="group" aria-label="المقياس المعروض">
        {metrics.map(item => <button key={item.id} type="button" className={metric === item.id ? "active" : ""} aria-pressed={metric === item.id} onClick={() => setMetric(item.id)}>{item.label}</button>)}
      </div>
    </div>
    {selectedPoint && <div className="activity-chart-summary" aria-live="polite">
      <span className="activity-dot" style={{ backgroundColor: currentMetric.color }} />
      <span>{longDate(selectedPoint.day)}</span>
      <strong>{metric === "revenue" ? currencyFormat.format(Number(selectedPoint.revenue) || 0) : numberFormat.format(Number(selectedPoint[metric]) || 0)}</strong>
    </div>}
    {points.length > 0 ? <svg className="activity-chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`رسم ${currentMetric.label} الفعلي لآخر سبعة أيام`}>
      {[0, 1, 2, 3].map(step => {
        const y = top + (plotHeight / 3) * step;
        return <line key={step} x1={left} x2={width - right} y1={y} y2={y} className="activity-grid-line" />;
      })}
      {points.map((point, index) => {
        const value = values[index] || 0;
        const barHeight = value > 0 ? Math.max(5, (value / maxValue) * (plotHeight - 8)) : 2;
        const x = left + index * slotWidth + (slotWidth - barWidth) / 2;
        const y = top + plotHeight - barHeight;
        const active = selectedPoint?.day === point.day;
        const label = `${longDate(point.day)}: ${currentMetric.label} ${metric === "revenue" ? currencyFormat.format(value) : numberFormat.format(value)}`;
        return <g key={point.day} className={`activity-chart-bar${active ? " selected" : ""}`} role="button" tabIndex={0} aria-label={label} onMouseEnter={() => setSelectedDay(point.day)} onFocus={() => setSelectedDay(point.day)} onClick={() => setSelectedDay(point.day)} onKeyDown={event => selectByKeyboard(event, point.day)}>
          <rect x={x} y={y} width={barWidth} height={barHeight} rx={8} style={{ fill: currentMetric.color }} />
          <text x={x + barWidth / 2} y={height - 12} textAnchor="middle">{shortDate(point.day)}</text>
        </g>;
      })}
    </svg> : <div className="activity-chart-empty">لا تتوفر نقاط يومية لعرضها.</div>}
    {allZero && <p className="activity-chart-note">لا توجد حركات مسجلة لهذا المقياس خلال الأيام السبعة الماضية؛ الأصفار مأخوذة من قاعدة البيانات وليست بيانات تجريبية.</p>}
    {metric === "revenue" && <p className="activity-chart-note">الإيراد يحتسب فقط مبالغ العربون أو السداد الكامل للحجوزات المعتمدة؛ لا تُحتسب الحجوزات عند الوصول أو اشتراكات الملاك لعدم تسجيل مبلغ الدفع الفعلي لها.</p>}
  </section>;
}
