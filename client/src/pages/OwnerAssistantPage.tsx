import { useState } from "react";
import { CalendarDays, Check, Clock3, FileWarning, LoaderCircle, RefreshCw, Send, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const api = trpc as any;
type ChatMessage = { role: "user" | "assistant"; content: string };

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("ar-EG", {
    timeZone: "Africa/Cairo", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(date);
}

function formatMoney(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 2 }).format(amount) : "—";
}

const reportStatus: Record<string, string> = { open: "جديد", reviewing: "قيد المراجعة", resolved: "تمت المعالجة", dismissed: "مرفوض" };
const reportReason: Record<string, string> = { spam: "إزعاج أو رسائل مزعجة", harassment: "مضايقة", fraud: "احتيال", unsafe: "محتوى غير آمن", other: "سبب آخر" };
const bookingStatus: Record<string, string> = { pending: "بانتظار المالك", approved: "مؤكد", rejected: "مرفوض", cancelled: "ملغي" };

export default function OwnerAssistantPage() {
  const snapshot = api.ownerAssistant.snapshot.useQuery(undefined, { retry: false });
  const ask = api.ownerAssistant.ask.useMutation();
  const publish = api.owner.publishSchedule.useMutation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [proposal, setProposal] = useState<any>(null);
  const data = snapshot.data as any;
  const summary = data?.summary || {};
  const reports = Array.isArray(data?.reports) ? data.reports : [];
  const bookings = Array.isArray(data?.bookings) ? data.bookings : [];
  const upcomingSlots = Array.isArray(data?.upcomingSlots) ? data.upcomingSlots : [];

  const submitPrompt = async (value: string) => {
    const prompt = value.trim();
    if (!prompt || ask.isPending) return;
    const history = messages.slice(-8);
    setDraft("");
    setMessages(previous => [...previous, { role: "user" as const, content: prompt }].slice(-16));
    setProposal(null);
    try {
      const result = await ask.mutateAsync({ prompt, history });
      setMessages(previous => [...previous, { role: "assistant" as const, content: result.answer }].slice(-16));
      setProposal(result.proposal || null);
      await snapshot.refetch();
    } catch (error: any) {
      toast.error(error?.message || "تعذر الحصول على رد المساعد.");
      setDraft(prompt);
      setMessages(previous => [...previous, { role: "assistant" as const, content: "لم أتمكن من تنفيذ الطلب الآن. احتفظت بسياق المحادثة؛ حاول مرة أخرى." }].slice(-16));
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void submitPrompt(draft);
  };

  const publishProposal = async () => {
    if (!proposal) return;
    try {
      await publish.mutateAsync({
        pitchId: proposal.pitchId,
        fieldId: proposal.fieldId,
        items: [{
          startsAt: proposal.startsAt,
          endsAt: proposal.endsAt,
          price: proposal.price,
          ...(proposal.depositAmount !== null ? { depositAmount: proposal.depositAmount } : {}),
        }],
      });
      toast.success("تم نشر الموعد المتاح؛ يمكن للاعبين حجزه الآن.");
      setProposal(null);
      await snapshot.refetch();
    } catch (error: any) {
      toast.error(error?.message || "تعذر نشر الموعد. قد يكون الوقت أصبح متعارضاً.");
    }
  };

  return <section className="owner-assistant-page" dir="rtl">
    <header className="assistant-page-heading">
      <span className="assistant-mark"><Sparkles size={20} /></span>
      <div><span className="eyebrow">مساعد ملعبك الذكي</span><h2>اسأل، لخّص، وجهّز موعداً</h2><p>إجابات من بيانات ملعبك الحالية، والبلاغات التي تخص ملعبك فقط.</p></div>
      <button className="button-outline compact-button assistant-refresh" onClick={() => void snapshot.refetch()} disabled={snapshot.isFetching} aria-label="تحديث البيانات">
        {snapshot.isFetching ? <LoaderCircle size={16} className="spin" /> : <RefreshCw size={16} />} تحديث
      </button>
    </header>

    {snapshot.isError && <div className="notice-banner"><FileWarning size={18} /><div><b>تعذر تحميل ملخص الملعب</b><span>تحقق من اتصالك ثم حدّث البيانات.</span></div></div>}

    <div className="assistant-metrics owner-assistant-metrics">
      <div><CalendarDays size={17} /><span>ملاعبك المنشورة</span><b>{summary.publishedPitches ?? 0}</b></div>
      <div><Clock3 size={17} /><span>حجوزات بانتظارك</span><b>{summary.pendingBookings ?? 0}</b></div>
      <div><CalendarDays size={17} /><span>مواعيد متاحة قادمة</span><b>{summary.upcomingAvailableSlots ?? 0}</b></div>
      <div><FileWarning size={17} /><span>بلاغات مرتبطة بملعبك</span><b>{summary.relatedReports ?? 0}</b></div>
    </div>

    <div className="owner-assistant-layout admin-assistant-layout">
      <section className="panel-card assistant-chat-card">
        <div className="panel-title"><div><span className="eyebrow">محادثة آمنة</span><h2>كيف أساعدك في إدارة ملعبك؟</h2></div><Sparkles size={18} /></div>
        {messages.length ? <div className="assistant-chat-log" aria-live="polite">{messages.map((message, index) => <article key={`${index}-${message.role}`} className={`assistant-message ${message.role}`}><b>{message.role === "user" ? "أنت" : "مساعد الملعب"}</b><p>{message.content}</p></article>)}</div> : <div className="assistant-welcome"><Sparkles size={24} /><b>اطلب ملخصاً أو اسأل عن بيانات ملعبك</b><span>أستطيع ترتيب البلاغات والحجوزات، واقتراح موعد متاح لتراجعه قبل النشر.</span></div>}
        {ask.isPending && <div className="assistant-thinking"><LoaderCircle size={16} className="spin" /> أراجع بيانات ملعبك وأرتب الإجابة…</div>}
        <div className="assistant-quick-prompts">
          {["اعرض أحدث البلاغات المرتبطة بملعبي", "اعمل لي تقريراً بالحجوزات المعلقة والقادمة", "ما المواعيد المتاحة هذا الأسبوع؟", "أريد نشر موعد متاح"].map(prompt => <button key={prompt} type="button" disabled={ask.isPending || snapshot.isLoading} onClick={() => void submitPrompt(prompt)}>{prompt}</button>)}
        </div>
        <form className="assistant-input-form" onSubmit={handleSubmit}><textarea value={draft} onChange={event => setDraft(event.target.value)} placeholder="اكتب سؤالك أو تفاصيل الموعد: اليوم، رقم الملعب، من الساعة إلى الساعة، ومبلغ العربون…" rows={3} maxLength={1600} disabled={ask.isPending} /><button className="button-primary" disabled={ask.isPending || !draft.trim()}>{ask.isPending ? <LoaderCircle size={16} className="spin" /> : <Send size={16} />} إرسال</button></form>
        {proposal && <div className="assistant-action-card">
          <div className="assistant-action-title"><CalendarDays size={19} /><span><b>معاينة موعد متاح — لم يُنشر بعد</b><small>هذا ينشئ وقتاً متاحاً للاعبين؛ لا ينشئ حجزاً باسم لاعب.</small></span></div>
          <div className="owner-proposal-grid"><div><small>الملعب</small><b>{proposal.pitchName}</b></div><div><small>الملعب الفرعي</small><b>{proposal.fieldName}</b></div><div><small>التاريخ</small><b>{proposal.date}{proposal.endsNextDay ? " (ينتهي في اليوم التالي)" : ""}</b></div><div><small>الوقت بتوقيت القاهرة</small><b>{proposal.startTime} – {proposal.endTime}</b></div><div><small>سعر الموعد</small><b>{formatMoney(proposal.price)} ج.م</b></div><div><small>العربون</small><b>{proposal.paymentMode === "deposit" ? `${formatMoney(proposal.effectiveDepositAmount)} ج.م` : "الدفع عند الوصول"}</b></div></div>
          <p className="assistant-action-warning">راجع التاريخ والملعب والسعر والعربون. لن يظهر الموعد للاعبين إلا بعد ضغط «نشر الموعد المتاح».</p>
          <div className="owner-proposal-actions"><button type="button" className="button-primary" onClick={() => void publishProposal()} disabled={publish.isPending}>{publish.isPending ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />} نشر الموعد المتاح</button><button type="button" className="button-outline" onClick={() => setProposal(null)} disabled={publish.isPending}><X size={16} /> إلغاء</button></div>
        </div>}
      </section>

      <aside className="assistant-context-column">
        <section className="panel-card"><div className="panel-title"><div><span className="eyebrow">المتابعة</span><h2>أحدث البلاغات الخاصة بك</h2></div><FileWarning size={18} /></div>{snapshot.isLoading ? <p className="assistant-context-loading"><LoaderCircle size={16} className="spin" /> جارٍ تحديث البلاغات…</p> : reports.length ? reports.slice(0, 8).map((report: any) => <article className="assistant-mini-row owner-report-row" key={report.id}><div className="owner-report-heading"><b>بلاغ #{report.id}</b><span className={`status-chip ${report.status}`}>{reportStatus[report.status] || report.status}</span></div><small>{reportReason[report.reason] || report.reason} · {formatDate(report.createdAt)} · {report.targetType === "pitch" ? "على الملعب" : report.targetType === "booking" ? "على حجز" : report.targetType === "field" ? "على ملعب فرعي" : "على الحساب"}</small>{report.details && <p>{report.details}</p>}</article>) : <p className="muted small">لا توجد بلاغات مرتبطة بملعبك حالياً.</p>}</section>

        <section className="panel-card"><div className="panel-title"><div><span className="eyebrow">آخر الطلبات</span><h2>الحجوزات الحديثة</h2></div><Clock3 size={18} /></div>{bookings.length ? bookings.slice(0, 8).map((booking: any) => <article className="assistant-mini-row" key={booking.id}><b>#{booking.id} · {booking.playerName} <span className={`status-chip ${booking.status}`}>{bookingStatus[booking.status] || booking.status}</span></b><small>{booking.pitchName} · {booking.fieldName} · {formatDate(booking.startsAt)}</small><small>الدفع: {booking.paymentMethod === "arrival" ? "عند الوصول" : booking.paymentMethod === "full" ? "كامل" : "عربون"} · {formatMoney(booking.paymentAmount)} ج.م</small></article>) : <p className="muted small">لا توجد حجوزات في ملاعبك.</p>}</section>

        <section className="panel-card"><div className="panel-title"><div><span className="eyebrow">المواعيد القادمة</span><h2>الأوقات المنشورة</h2></div><CalendarDays size={18} /></div>{upcomingSlots.length ? upcomingSlots.slice(0, 8).map((slot: any) => <article className="assistant-mini-row" key={slot.id}><b>{slot.pitchName} · {slot.fieldName}</b><small>{formatDate(slot.startsAt)} – {formatDate(slot.endsAt)}</small><small>السعر {formatMoney(slot.price)} ج.م · العربون {slot.depositAmount == null ? "حسب إعداد الملعب" : `${formatMoney(slot.depositAmount)} ج.م`}</small></article>) : <p className="muted small">لا توجد مواعيد مستقبلية منشورة حالياً.</p>}</section>
      </aside>
    </div>
    <p className="assistant-source-note"><FileWarning size={15} /> الملخص مبني على آخر تحديث لقاعدة بيانات ملاعبك. زر تأكيد النشر وحده ينشئ الموعد بعد إعادة فحص الملكية والتعارض.</p>
  </section>;
}
