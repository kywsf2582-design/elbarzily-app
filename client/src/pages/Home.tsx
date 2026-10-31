import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import {
  Activity, ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpLeft, BadgeCheck,
  Banknote, BarChart3, Bell, CalendarCheck2, CalendarDays, Camera, Check, CheckCheck,
  ChevronLeft, ChevronRight, CircleDollarSign, Clock3, Compass, Copy, Crown,
  Filter, FileText, Flag, Headphones, ImagePlus, LoaderCircle, MapPin, MessageCircle, ClipboardList,
  MessageSquareText, Mic, Minus, Moon, MoreHorizontal, Navigation, Paperclip, Plus, Search,
  Download, Send, Settings2, Shield, ShieldCheck, ShieldOff, Sparkles, Star, Sun, Trophy, Users,
  Phone as PhoneCall, Video,
  Smile, Trash2, UserRound, Wallet, X, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { getAuthAwareOpenPath, resolveAppOpenTarget } from "@/lib/appLinks";
import { microphoneErrorMessage } from "@/lib/mediaPermissions";
import { useTheme } from "@/contexts/ThemeContext";
import "./chat.css";
import ChatPreviewPanel from "@/features/chat/ChatPreviewPanel";
import { MessageReadReceipt, QUICK_REACTIONS, QuickEmojiPicker, SupportProfileDialog, WaveformPlayer } from "@/features/chat/ChatPresentation";
import CallOverlay from "@/features/chat/CallOverlay";
import AuthPanel from "@/features/auth/AuthPanel";
import { AppShell, PageHeading, SectionHeader } from "@/features/app/AppShell";
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const PitchSuggestionPage = lazy(() => import("@/pages/PitchSuggestionPage"));
const QrCheckSection = lazy(() => import("@/pages/QrCheckSection"));
const SuspendedAccountPage = lazy(() => import("@/pages/SuspendedAccountPage"));
const OwnerAssistantPage = lazy(() => import("@/pages/OwnerAssistantPage"));
const DownloadPage = lazy(() => import("@/pages/DownloadPage"));
const RewardsPage = lazy(() => import("@/pages/RewardsPage"));
const VerifyRewardsPage = lazy(() => import("@/pages/VerifyRewardsPage"));

const api = trpc as any;
const heroImage = "/manus-storage/async-images/ikcEM62f5RvwpwL0o8yThJ/image-1.webp";
const pageLoading = <div role="status" style={{ minHeight: "20vh", display: "grid", placeItems: "center" }}>جارٍ تحميل الصفحة…</div>;

type User = { id: number; name?: string | null; email?: string | null; phone?: string | null; region?: string | null; role?: string; accountType?: string; status?: string; isSuspended?: boolean; moderatorPermissions?: string[] | null; avatarUrl?: string | null };
type Pitch = { id: number; name: string; address?: string; city?: string; region?: string; posterUrl?: string | null; imageUrl?: string | null; mapUrl?: string | null; rating?: number | string; ratingCount?: number; subPitchCount?: number; morningPrice?: number | string; eveningPrice?: number | string; ownerName?: string; captainName?: string | null; captainPhone?: string | null; vodafoneCashNumber?: string | null; bookingPaymentMode?: "arrival" | "deposit" | null; depositAmount?: number | string | null; verified?: boolean; description?: string };
type Item = Record<string, any>;

function itemsOf(data: any): Item[] { return Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : []; }
function money(value: unknown) { const amount = Number(value); return Number.isFinite(amount) ? new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 0 }).format(amount) : "—"; }
function LazyPage({ children }: { children: ReactNode }) { return <Suspense fallback={pageLoading}>{children}</Suspense>; }
function VoiceNotePlayer({ messageId, review = false, durationSeconds = 12 }: { messageId: number; review?: boolean; durationSeconds?: number | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const mediaQuery = api.chat.voiceUrl.useQuery({ messageId }, { enabled: false, retry: false });
  const load = async () => {
    try {
      const result = await mediaQuery.refetch();
      if (!result.data?.url) throw new Error("الرسالة الصوتية غير متاحة");
      setUrl(result.data.url);
    } catch (error: any) {
      toast.error(error?.message || "تعذر تحميل الرسالة الصوتية.");
    }
  };
  return <WaveformPlayer src={url || undefined} durationSeconds={durationSeconds} loading={mediaQuery.isFetching} onRequestSource={load} label={review ? "رسالة صوتية للمراجعة" : "رسالة صوتية"} />;
}
function ChatMediaPreview({ messageId, messageType, fileName }: { messageId: number; messageType: string; fileName?: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const mediaQuery = api.chat.voiceUrl.useQuery({ messageId }, { enabled: false, retry: false });
  const load = async () => { try { const result = await mediaQuery.refetch(); if (!result.data?.url) throw new Error("الوسائط غير متاحة"); setUrl(result.data.url); } catch (error: any) { toast.error(error?.message || "تعذر تحميل الوسائط."); } };
  if (!url) return <button type="button" className="chat-media-load" onClick={() => void load()} disabled={mediaQuery.isFetching}><Paperclip size={14} />{mediaQuery.isFetching ? "جارٍ تجهيز الملف…" : messageType === "image" ? "عرض الصورة" : messageType === "video" ? "تشغيل الفيديو" : `تحميل ${fileName || "الملف"}`}</button>;
  if (messageType === "image") return <img className="chat-media-image" src={url} alt={fileName || "صورة مرفقة"} loading="lazy" />;
  if (messageType === "video") return <video className="chat-media-video" controls preload="metadata" src={url} />;
  return <a className="chat-media-file" href={url} target="_blank" rel="noreferrer"><FileText size={15} />{fileName || "فتح الملف"}</a>;
}
const cairoCalendarFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" });
const cairoHourFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", hour: "2-digit", hourCycle: "h23" });
const cairoOffsetFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", timeZoneName: "longOffset" });
function displayDate(date: Date) { return new Intl.DateTimeFormat("ar-EG", { timeZone: "Africa/Cairo", weekday: "short", day: "numeric" }).format(date); }
function dateKey(date: Date) {
  const parts = cairoCalendarFormatter.formatToParts(date);
  const year = parts.find(part => part.type === "year")?.value;
  const month = parts.find(part => part.type === "month")?.value;
  const day = parts.find(part => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}
function cairoHour(value: string) {
  return Number(cairoHourFormatter.formatToParts(new Date(value)).find(part => part.type === "hour")?.value);
}
function cairoDateTimeToIso(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wallTime = Date.UTC(year, month - 1, day, hour, minute, 0);
  if (![year, month, day, hour, minute, wallTime].every(Number.isFinite)) throw new Error("وقت غير صالح");
  let instant = wallTime;
  for (let attempt = 0; attempt < 4; attempt++) {
    const zone = cairoOffsetFormatter.formatToParts(new Date(instant)).find(part => part.type === "timeZoneName")?.value;
    const offset = zone?.match(/^GMT(?:([+-])(\d{2}):(\d{2}))?$/);
    if (!offset) throw new Error("تعذر تحديد توقيت القاهرة");
    const minutes = offset[1] ? (offset[1] === "+" ? 1 : -1) * (Number(offset[2]) * 60 + Number(offset[3])) : 0;
    const corrected = wallTime - minutes * 60_000;
    if (corrected === instant) return new Date(corrected).toISOString();
    instant = corrected;
  }
  return new Date(instant).toISOString();
}
function errorText(error: any, fallback: string) { return error?.message || fallback; }

function EmptyState({ icon: Icon = Compass, title, text, action }: { icon?: any; title: string; text: string; action?: React.ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={24} /></span><h3>{title}</h3><p>{text}</p>{action}</div>;
}

function PitchCard({ pitch }: { pitch: Pitch }) {
  const image = pitch.posterUrl || pitch.imageUrl || heroImage;
  const area = pitch.city || pitch.address || "القاهرة";
  const rate = pitch.rating ? Number(pitch.rating).toFixed(1) : "جديد";
  const price = pitch.eveningPrice ?? pitch.morningPrice;
  return <article className="pitch-card">
    <div className="pitch-card-image" style={{ backgroundImage: `linear-gradient(180deg, transparent 35%, rgba(7,9,7,.82)), url("${image}")` }}>
      <span className="pitch-category">ملعب كرة قدم</span>
      <button className="favorite-button" aria-label="إضافة للمفضلة" onClick={() => toast.message("أضف الملعب للمفضلة بعد تسجيل الدخول.")}><span>♡</span></button>
      {pitch.verified && <span className="verified-chip"><BadgeCheck size={13} /> موثّق</span>}
      <div className="pitch-image-title"><h3>{pitch.name}</h3><span><MapPin size={13} />{area}</span></div>
    </div>
    <div className="pitch-card-body"><div className="pitch-meta"><span className="rating"><Star size={14} fill="currentColor" />{rate}{pitch.ratingCount ? <small>({pitch.ratingCount})</small> : null}</span><span className="pitch-subfields">{pitch.subPitchCount || 1} ملاعب فرعية</span></div><div className="pitch-card-bottom"><div className="pitch-price"><b>{price ? money(price) : "اطلب السعر"}</b><small>ج.م / ساعة</small></div><a className="small-book-button" href={`/book/${pitch.id}`}>احجز<ArrowLeft size={15} /></a></div></div>
  </article>;
}

function DateStrip({ selected, onSelect }: { selected: string; onSelect: (date: string) => void }) {
  const days = useMemo(() => {
    const [year, month, day] = dateKey(new Date()).split("-").map(Number);
    return Array.from({ length: 7 }, (_, index) => new Date(Date.UTC(year, month - 1, day + index, 12)));
  }, []);
  return <div className="date-strip">{days.map((date, index) => { const key = dateKey(date); return <button key={key} onClick={() => onSelect(key)} className={`date-cell ${selected === key ? "selected" : ""}`}><small>{index === 0 ? "اليوم" : displayDate(date).split(" ")[0]}</small><b>{new Intl.DateTimeFormat("ar-EG", { day: "numeric" }).format(date)}</b><i /></button>; })}</div>;
}

function HomeLanding({ user, pitches }: { user: User | null; pitches: Pitch[] }) {
  const [location, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [area, setArea] = useState("كل المناطق");
  const [selectedDate, setSelectedDate] = useState(dateKey(new Date()));
  const filtered = pitches.filter(pitch => `${pitch.name} ${pitch.address || ""} ${pitch.city || pitch.region || ""}`.toLowerCase().includes(search.toLowerCase()) && (area === "كل المناطق" || (pitch.city || pitch.region || pitch.address || "").includes(area)));
  return <>
    <section className="hero-banner" style={{ backgroundImage: `linear-gradient(90deg, rgba(11,14,10,.97) 0%, rgba(11,14,10,.84) 39%, rgba(11,14,10,.25) 100%), linear-gradient(0deg, rgba(11,14,10,.68), transparent 55%), url("${heroImage}")` }}>
      <div className="hero-content"><div className="hero-kicker"><span className="kicker-dot" /> كرة القدم تجمعنا</div><h1>الملعب <span>ينادي.</span><br />مين معاك؟</h1><p>احجز ملعبك، لمّ أصحابك، وخلي المباراة تبدأ.<br className="desktop-only" /> كل اللي تحتاجه للعب — في مكان واحد.</p><div className="hero-actions"><button className="button-primary" onClick={() => setLocation("/book")}><CalendarDays size={17} /> احجز ملعبك</button><button className="button-ghost" onClick={() => setLocation("/play")}><Users size={17} /> اعمل ماتش</button></div><div className="hero-note"><span><Check size={13} /> ملاعب موثوقة</span><i /><span><Check size={13} /> حجز واضح وسهل</span></div></div>
      <div className="hero-stamp"><span>اللعب</span><b>١١</b><span>يبدأ هنا</span><i /></div>
      <div className="hero-image-caption"><span className="caption-line" /> ليالي الملعب أحلى</div>
    </section>
    <div className="quick-search-card"><div className="search-location"><MapPin size={18} /><label><small>المنطقة</small><select value={area} onChange={event => setArea(event.target.value)}><option>كل المناطق</option><option>مدينة نصر</option><option>المعادي</option><option>التجمع</option><option>الهرم</option></select></label><ChevronDownIcon /></div><div className="search-divider" /><div className="search-date"><CalendarDays size={18} /><label><small>موعد اللعب</small><input type="date" value={selectedDate} min={dateKey(new Date())} onChange={event => setSelectedDate(event.target.value)} /></label></div><div className="search-divider" /><div className="search-keyword"><Search size={18} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="اسم الملعب أو المنطقة" /></div><button className="search-submit" onClick={() => setLocation("/book")}><Search size={17} /><span>ابحث عن ملعب</span></button></div>
    <section className="section-block"><div className="feature-strip"><div className="feature-icon"><Zap size={18} /></div><div><b>ماتش على مزاجك</b><span>اختَر وقتك والملعب المناسب</span></div><ArrowLeft size={17} className="feature-arrow" /></div><div className="feature-strip"><div className="feature-icon muted-feature"><Users size={18} /></div><div><b>اكمل فريقك</b><span>انضم لمباراة أو كوّن سكوادك</span></div><ArrowLeft size={17} className="feature-arrow" /></div><div className="feature-strip"><div className="feature-icon"><ShieldCheck size={18} /></div><div><b>حجز موثوق</b><span>كل طلب يمر بمراجعة واضحة</span></div><ArrowLeft size={17} className="feature-arrow" /></div></section>
    <section className="section-block pitch-section"><SectionHeader title="ملاعب قريبة منك" subtitle="اختار الملعب اللي يناسب لعبتك" href="/book" /><div className="section-filter"><span className="live-indicator"><i /> متاح للحجز</span><button className="filter-button"><Filter size={15} /> تصفية</button></div>{filtered.length ? <div className="pitch-grid">{filtered.slice(0, 4).map(pitch => <PitchCard key={pitch.id} pitch={pitch} />)}</div> : <EmptyState icon={MapPin} title="الملاعب قادمة إلى منطقتك" text="لا توجد ملاعب معلنة الآن. جرّب منطقة أخرى أو اقترح ملعباً جديداً." action={<button className="button-outline" onClick={() => setLocation("/suggest-pitch")}>اقترح ملعباً <ArrowLeft size={15} /></button>} />}</section>
    <section className="join-banner"><div className="join-banner-icon"><Trophy size={25} /></div><div><span className="eyebrow">اللعبة تكمل بنا</span><h2>ناقصك لاعب؟ اعمل ماتش.</h2><p>حدد الملعب والوقت، وافتح باب الانضمام للاعبين.</p></div><button className="button-primary" onClick={() => setLocation(user ? "/play" : "/join")}>ابدأ مباراة <ArrowLeft size={17} /></button></section>
  </>;
}
function ChevronDownIcon() { return <span className="select-chevron">⌄</span>; }

function BookingList({ pitches }: { pitches: Pitch[] }) {
  const [location, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState(dateKey(new Date()));
  const [period, setPeriod] = useState("الكل");
  const filtered = pitches.filter(pitch => `${pitch.name} ${pitch.address || ""} ${pitch.city || pitch.region || ""}`.toLowerCase().includes(search.toLowerCase()));
  return <>
    <PageHeading eyebrow="ملعبك على بُعد حجز" title="احجز ملعبك" description="حدد المنطقة والموعد، وهنوصلك بالملعب المناسب." action={<button className="button-outline compact-button" onClick={() => setLocation("/book")}>قريب مني <Navigation size={15} /></button>} />
    <div className="booking-toolbar"><label className="toolbar-search"><Search size={17} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="ابحث باسم الملعب أو المنطقة" /></label><button className="filter-button"><Filter size={16} /> تصفية</button></div>
    <div className="availability-panel"><div className="panel-heading"><div><b>اختار يوم اللعب</b><small>المواعيد المتاحة تتحدث من أصحاب الملاعب</small></div><CalendarDays size={19} /></div><DateStrip selected={selectedDate} onSelect={setSelectedDate} /><div className="period-filter">{["الكل", "بعد الظهر", "المساء", "الليل", "بعد منتصف الليل"].map(item => <button key={item} className={period === item ? "active" : ""} onClick={() => setPeriod(item)}>{item}</button>)}</div></div>
    <div className="section-header results-heading"><div><h2>الملاعب المتاحة</h2><p>{filtered.length} ملعب في القائمة</p></div><span className="sort-label">الترتيب: <b>الأقرب</b><ChevronDownIcon /></span></div>
    {filtered.length ? <div className="pitch-grid large-grid">{filtered.map(pitch => <PitchCard key={pitch.id} pitch={pitch} />)}</div> : <EmptyState icon={CalendarDays} title="مافيش ملاعب معلنة لسه" text="عندما ينشر أصحاب الملاعب مواعيدهم، ستظهر هنا. يمكنك اقتراح ملعب قريب منك." action={<button className="button-outline" onClick={() => setLocation("/squad")}>اقترح ملعباً <ArrowLeft size={15} /></button>} />}
  </>;
}

function BookPitch({ user, pitches }: { user: User | null; pitches: Pitch[] }) {
  const [location, setLocation] = useLocation();
  const pitchId = Number(location.split("/")[2]);
  const pitch = pitches.find(item => Number(item.id) === pitchId);
  const [selectedDate, setSelectedDate] = useState(dateKey(new Date()));
  const [selectedPeriod, setSelectedPeriod] = useState("الكل");
  const [selectedSlot, setSelectedSlot] = useState<any>(null);
  const [subPitch, setSubPitch] = useState(0);
  const [receiptUrl, setReceiptUrl] = useState("");
  const [paymentChoice, setPaymentChoice] = useState<"deposit" | "full">("deposit");
  const slotsQuery = api.pitches.availableSlots.useQuery({ pitchId, date: selectedDate }, { enabled: Boolean(pitchId), retry: false });
  const fieldsQuery = api.pitches.fields.useQuery({ pitchId }, { enabled: Boolean(pitchId), retry: false });
  const captainsQuery = api.pitches.captains.useQuery({ pitchId }, { enabled: Boolean(pitchId), retry: false });
  const upload = api.uploads.image.useMutation();
  const createBooking = api.bookings.create.useMutation();
  const openPitchChat = api.chat.openPitch.useMutation();
  const allSlots = itemsOf(slotsQuery.data).filter(slot => !subPitch || slot.fieldId === subPitch);
  const periodHour = (slot: Item) => cairoHour(slot.startsAt);
  const slots = allSlots.filter(slot => { const hour = periodHour(slot); return selectedPeriod === "الكل" || (selectedPeriod === "بعد الظهر" && hour >= 12 && hour < 16) || (selectedPeriod === "المساء" && hour >= 16 && hour < 20) || (selectedPeriod === "الليل" && hour >= 20 && hour < 24) || (selectedPeriod === "بعد منتصف الليل" && hour >= 0 && hour < 6); });
  const fields = itemsOf(fieldsQuery.data);
  const captains = itemsOf(captainsQuery.data);
  const paymentMode = pitch?.bookingPaymentMode === "deposit" ? "deposit" : "arrival";
  const paymentMethod = paymentMode === "deposit" ? paymentChoice : "arrival";
  const depositAmount = Number(selectedSlot?.depositAmount ?? pitch?.depositAmount);
  const displayTime = (value: any) => value ? new Intl.DateTimeFormat("ar-EG", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "";
  const handleReceipt = async (file?: File) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { toast.error("ارفع صورة بصيغة JPG أو PNG أو WebP."); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("حجم الإيصال يجب ألا يتجاوز 5 ميغابايت."); return; }
    try { const dataBase64 = (await fileToDataUrl(file)).split(",")[1]; const result = await upload.mutateAsync({ fileName: file.name, mimeType: file.type, dataBase64 }); setReceiptUrl((result as any).url); toast.success("تم رفع الإيصال."); }
    catch (error: any) { toast.error(errorText(error, "تعذر رفع الإيصال.")); }
  };
  if (!pitchId) return <BookingList pitches={pitches} />;
  if (!pitch) return <><button className="back-link" onClick={() => setLocation("/book")}><ArrowRight size={16} /> كل الملاعب</button><EmptyState title="الملعب غير متاح" text="قد يكون الملعب غير منشور أو الرابط غير صحيح." /></>;
  const selectedPaymentMethod = paymentMode === "arrival" ? "arrival" : paymentMethod;
  const amountDue = selectedSlot ? (selectedPaymentMethod === "deposit" ? depositAmount : Number(selectedSlot.price)) : 0;
  const requiresReceipt = selectedPaymentMethod === "deposit" || selectedPaymentMethod === "full";
  const contactOwner = async () => {
    if (!user) { setLocation("/join"); return; }
    try { const room = await openPitchChat.mutateAsync({ pitchId }); setLocation(`/squad?room=${(room as any).id}`); }
    catch (error: any) { toast.error(errorText(error, "تعذر فتح محادثة صاحب الملعب.")); }
  };
  const book = async () => {
    if (!user) { setLocation("/join"); return; }
    if (!selectedSlot) { toast.error("اختَر موعداً متاحاً أولاً."); return; }
    if (paymentMode === "deposit" && (!depositAmount || depositAmount <= 0)) { toast.error("لم يحدد صاحب الملعب قيمة العربون بعد."); return; }
    if (paymentMode === "deposit" && !pitch.vodafoneCashNumber) { toast.error("لم يضف صاحب الملعب رقم Vodafone Cash بعد."); return; }
    if (requiresReceipt && !receiptUrl) { toast.error("أرفق صورة إيصال الدفع قبل إرسال الطلب."); return; }
    try {
      const bookingResult = await createBooking.mutateAsync({ pitchId, fieldId: selectedSlot.fieldId, scheduleId: selectedSlot.id, paymentMethod: selectedPaymentMethod, ...(receiptUrl ? { receiptUrl } : {}),  });
      toast.success(bookingResult.status === "approved" ? "تمت مطابقة الإيصال وتأكيد الحجز وإصدار QR." : bookingResult.status === "rejected" ? "تم رفض الإيصال وتحرير الموعد للاعبين الآخرين." : "تم إرسال الطلب للمراجعة اليدوية من صاحب الملعب.");
      setLocation("/profile");
    } catch (error: any) { toast.error(errorText(error, "تعذر إرسال طلب الحجز.")); }
  };
  return <>
    <button className="back-link" onClick={() => setLocation("/book")}><ArrowRight size={16} /> العودة للملاعب</button>
    <div className="pitch-detail-layout single-column"><div className="pitch-detail-main">
      <div className="pitch-detail-cover" style={{ backgroundImage: `linear-gradient(0deg, rgba(8,10,8,.78), transparent 60%), url("${pitch.imageUrl || heroImage}")` }}><span className="pitch-category">ملعب كرة قدم</span><div><h1>{pitch.name}</h1><span><MapPin size={15} />{pitch.address || pitch.city || "العنوان غير محدد"}</span></div></div>
      <div className="pitch-detail-meta"><span><Star size={15} fill="currentColor" /> {pitch.rating ? Number(pitch.rating).toFixed(1) : "جديد"}</span><span><Users size={15} /> {pitch.subPitchCount || 1} ملاعب فرعية</span>{pitch.captainPhone && <a className="captain-phone-link" href={`tel:${pitch.captainPhone}`}><PhoneIcon /> {pitch.captainName || "كابتن الملعب"}: {pitch.captainPhone}</a>}{captains.length > 0 && <><span>أرقام الكباتن:</span>{captains.map(captain => <a key={captain.id} className="captain-phone-link" href={`tel:${captain.phone}`}><PhoneIcon /> {captain.name}: {captain.phone}</a>)}</>}{pitch.mapUrl && <a href={pitch.mapUrl} target="_blank" rel="noreferrer"><Navigation size={15} /> الاتجاهات</a>}<button className="button-outline compact-button" onClick={contactOwner} disabled={openPitchChat.isPending}><MessageCircle size={15} /> مراسلة صاحب الملعب</button></div>
      <div className="detail-card"><SectionHeader title="اختار يومك" subtitle="المواعيد المنشورة من إدارة الملعب" /><DateStrip selected={selectedDate} onSelect={date => { setSelectedDate(date); setSelectedSlot(null); }} />
        <div className="subpitch-filter"><span>الملعب الفرعي</span><select value={subPitch} onChange={event => { setSubPitch(Number(event.target.value)); setSelectedSlot(null); }}><option value={0}>كل الملاعب</option>{fields.map(field => <option key={field.id} value={field.id}>{field.name}</option>)}</select></div>
        <div className="period-filter">{["الكل", "بعد الظهر", "المساء", "الليل", "بعد منتصف الليل"].map(item => <button key={item} className={selectedPeriod === item ? "active" : ""} onClick={() => { setSelectedPeriod(item); setSelectedSlot(null); }}>{item}</button>)}</div><div className="slot-heading"><Clock3 size={16} /><span>المواعيد المتاحة</span></div>{slotsQuery.isLoading ? <p className="muted">جارٍ تحميل المواعيد...</p> : slots.length ? <div className="slot-grid">{slots.map((slot, index) => { const key = slot.id ?? `${slot.startsAt}-${index}`; const label = `${displayTime(slot.startsAt)} – ${displayTime(slot.endsAt)}`; return <button key={key} className={`slot-card ${selectedSlot?.id === slot.id ? "selected" : ""}`} onClick={() => setSelectedSlot(slot)}><span>{label}</span><small>{money(slot.price)} ج.م{slot.depositAmount != null && <> · عربون {money(slot.depositAmount)} ج.م</>}</small></button>; })}</div> : <EmptyState icon={Clock3} title="لا توجد مواعيد منشورة لهذا اليوم" text="جرّب يوماً آخر أو تواصل مع صاحب الملعب." />}

      </div>
      <section className="booking-summary booking-summary-inline"><span className="eyebrow">احجز لعبتك</span><h2>كمّل طلب الحجز</h2><p>{paymentMode === "arrival" ? "الدفع عند الوصول إلى الملعب، ولا تحتاج إلى رفع إيصال." : "حوّل العربون أو المبلغ كاملاً إلى رقم Vodafone Cash ثم أرفق الإيصال."}</p><div className="summary-line"><span>الملعب</span><b>{pitch.name}</b></div><div className="summary-line"><span>اليوم</span><b>{selectedDate}</b></div><div className="summary-line"><span>الموعد</span><b>{selectedSlot ? `${displayTime(selectedSlot.startsAt)} – ${displayTime(selectedSlot.endsAt)}` : "اختر موعداً"}</b></div>{paymentMode === "deposit" && <div className="payment-choice"><span>طريقة الدفع</span><div><label><input type="radio" checked={selectedPaymentMethod === "deposit"} onChange={() => { setPaymentChoice("deposit"); setReceiptUrl(""); }} /> دفع العربون ({money(depositAmount)} ج.م)</label><label><input type="radio" checked={selectedPaymentMethod === "full"} onChange={() => { setPaymentChoice("full"); setReceiptUrl(""); }} /> دفع المبلغ كاملاً ({selectedSlot ? money(selectedSlot.price) : "—"} ج.م)</label></div></div>}<div className="summary-line"><span>{paymentMode === "arrival" ? "الدفع" : "المبلغ المطلوب"}</span><b>{paymentMode === "arrival" ? "عند الوصول" : amountDue ? `${money(amountDue)} ج.م` : "يظهر بعد الاختيار"}</b></div>{paymentMode === "deposit" && <div className="cash-payment-note"><Banknote size={16} /><span>Vodafone Cash: <strong>{pitch.vodafoneCashNumber || "لم يحدد صاحب الملعب الرقم بعد"}</strong></span></div>}{requiresReceipt && <div className="receipt-drop"><label><ImagePlus size={18} /><span><b>{upload.isPending ? "جارٍ رفع الإيصال..." : receiptUrl ? "تم إرفاق الإيصال" : "أرفق صورة إيصال الدفع"}</b><small>JPG أو PNG أو WebP حتى 5 MB</small></span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => handleReceipt(event.target.files?.[0])} /></label>{receiptUrl && <span className="receipt-ready"><Check size={14} /> جاهز للإرسال</span>}</div>}<button className="button-primary full-button" disabled={createBooking.isPending || upload.isPending} onClick={book}>{createBooking.isPending ? <LoaderCircle size={17} className="spin" /> : <>إرسال طلب الحجز <ArrowLeft size={16} /></>}</button><div className="booking-policy"><ShieldCheck size={14} /><span>بعد الإرسال ينتظر الطلب موافقة صاحب الملعب، ثم يظهر QR في ملفك.</span></div></section>
    </div></div>
  </>;
}
function PhoneIcon() { return <span aria-hidden="true">☎</span>; }

function MatchesPage({ user, pitches }: { user: User | null; pitches: Pitch[] }) {
  const [location, setLocation] = useLocation(); const [creating, setCreating] = useState(false); const [pitchId, setPitchId] = useState(0); const [fieldId, setFieldId] = useState(0); const [title, setTitle] = useState(""); const [startsDate, setStartsDate] = useState(dateKey(new Date())); const [startsTime, setStartsTime] = useState("19:00"); const [maxPlayers, setMaxPlayers] = useState("10");
  const matchesQuery = api.matches.list.useQuery(undefined, { retry: false }); const joinMatch = api.matches.join.useMutation(); const createMatch = api.matches.create.useMutation();
  const fieldsQuery = api.pitches.fields.useQuery({ pitchId }, { enabled: Boolean(pitchId), retry: false }); const fields = itemsOf(fieldsQuery.data); const matches = itemsOf(matchesQuery.data);
  const join = async (match: Item) => { if (!user) { setLocation("/join"); return; } try { await joinMatch.mutateAsync({ matchId: match.id }); await matchesQuery.refetch(); toast.success("انضممت للمباراة وأُضيفت إلى دردشة الفريق."); } catch (error: any) { toast.error(errorText(error, "تعذر الانضمام للمباراة.")); } };
  const submitMatch = async (event: React.FormEvent) => { event.preventDefault(); if (!user) { setLocation("/join"); return; } if (!pitchId || !fieldId) { toast.error("اختر ملعباً معتمداً وملعباً فرعياً."); return; } try { await createMatch.mutateAsync({ pitchId, fieldId, title: title.trim(), startsAt: new Date(`${startsDate}T${startsTime}:00`).toISOString(), maxPlayers: Number(maxPlayers) }); await matchesQuery.refetch(); setCreating(false); setTitle(""); toast.success("تم إنشاء المباراة وغرفة دردشة الفريق."); } catch (error: any) { toast.error(errorText(error, "تعذر إنشاء المباراة. لا يمكن اختيار إلا ملعب منشور.")); } };
  return <><PageHeading eyebrow="كوّن فريقك" title="اعمل ماتش" description="افتح مباراة على ملعب مسجل، شاركها، وخلي لاعبين منطقتك يكملوا الفريق." action={<button className="button-primary compact-button" onClick={() => user ? setCreating(value => !value) : setLocation("/join")}><Plus size={17} /> مباراة جديدة</button>} /><div className="match-promo"><div className="promo-badge"><Users size={20} /></div><div><span className="eyebrow">لاعب ناقص؟ مش مشكلة.</span><h2>مباراتك الجاية تبدأ من هنا</h2><p>تنضم تلقائياً إلى دردشة المباراة بعد قبول انضمامك.</p></div><div className="promo-ball">⚽</div></div>
    {creating && <form className="panel-card owner-form match-create-form" onSubmit={submitMatch}><div className="panel-title"><div><span className="eyebrow">مباراة جديدة</span><h2>حدد الملعب والموعد</h2></div><Trophy size={19} /></div>{pitches.length ? <><label className="form-field"><span>الملعب المعتمد</span><select value={pitchId || ""} onChange={event => { setPitchId(Number(event.target.value)); setFieldId(0); }} required><option value="" disabled>اختر ملعباً منشوراً</option>{pitches.map(pitch => <option key={pitch.id} value={pitch.id}>{pitch.name} — {pitch.city || pitch.address}</option>)}</select></label><label className="form-field"><span>الملعب الفرعي</span><select value={fieldId || ""} onChange={event => setFieldId(Number(event.target.value))} required><option value="" disabled>{fieldsQuery.isLoading ? "جارٍ التحميل..." : "اختر الملعب الفرعي"}</option>{fields.map(field => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label><label className="form-field"><span>اسم المباراة</span><input value={title} onChange={event => setTitle(event.target.value)} placeholder="مباراة خماسي ودية" required /></label><div className="two-fields"><label className="form-field"><span>التاريخ</span><input type="date" min={dateKey(new Date())} value={startsDate} onChange={event => setStartsDate(event.target.value)} required /></label><label className="form-field"><span>وقت البداية</span><input type="time" value={startsTime} onChange={event => setStartsTime(event.target.value)} required /></label></div><label className="form-field"><span>عدد اللاعبين الأقصى</span><input type="number" min="2" max="50" value={maxPlayers} onChange={event => setMaxPlayers(event.target.value)} /></label><button className="button-primary" disabled={createMatch.isPending}>{createMatch.isPending ? <LoaderCircle size={17} className="spin" /> : <>إنشاء المباراة <ArrowLeft size={16} /></>}</button></> : <p className="muted">لا توجد ملاعب منشورة بعد، ولا يمكن إنشاء مباراة خارج ملعب مسجل.</p>}</form>}
    <SectionHeader title="مباريات مفتوحة" subtitle="انضم لمباراة مناسبة لمستواك ووقتك" /><div className="match-list">{matchesQuery.isLoading ? <LoadingLine label="جارٍ تحميل المباريات..." /> : matches.length ? matches.map(match => { const startsAt = new Date(match.startsAt); return <article key={match.id} className="match-card"><div className="match-date-badge"><small>{startsAt.toLocaleDateString("ar-EG", { month: "short" })}</small><b>{startsAt.getDate()}</b></div><div className="match-card-info"><span className="match-status"><i />{match.status === "full" ? "اكتمل الفريق" : "مفتوحة للانضمام"}</span><h3>{match.title || "مباراة كرة قدم"}</h3><p><MapPin size={14} />{match.pitchName || "ملعب مسجل"} <i /> <Clock3 size={14} />{startsAt.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}</p></div><div className="match-players"><div className="mini-avatars"><span>ع</span><span>م</span><span>+</span></div><small>{match.joinedCount || 1}/{match.maxPlayers || 10} لاعبين</small></div><button className="button-outline compact-button" onClick={() => join(match)} disabled={joinMatch.isPending || match.status === "full"}>{match.status === "full" ? "اكتملت" : "انضم للمباراة"}<ArrowLeft size={15} /></button></article>; }) : <EmptyState icon={Trophy} title="لا توجد مباريات مفتوحة الآن" text="أنشئ مباراة على ملعب معتمد، أو ارجع قريباً لتشوف المباريات الجديدة." />}</div></>;
}

function SquadPage({ user }: { user: User | null }) {
  const [, setLocation] = useLocation();
  const [searchText, setSearchText] = useState("");
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState("");
  const [skillLevel, setSkillLevel] = useState("");
  const suggestionsQuery = api.social.players.suggestions.useQuery(undefined, { enabled: Boolean(user), retry: false });
  const hasFilters = Boolean(query || position || skillLevel);
  const searchQuery = api.social.players.search.useQuery({ query: query || undefined, position: position || undefined, skillLevel: skillLevel || undefined, limit: 24 }, { enabled: Boolean(user && hasFilters), retry: false });
  useEffect(() => { const timer = window.setTimeout(() => setQuery(searchText.trim()), 220); return () => window.clearTimeout(timer); }, [searchText]);
  if (!user) return <SignInGate title="فريقك يبدأ من هنا" text="سجّل الدخول لاكتشاف لاعبين، إرسال طلبات صداقة، وتجهيز مباراتك القادمة." />;
  const players = itemsOf(hasFilters ? searchQuery.data : suggestionsQuery.data);
  return <>
    <PageHeading eyebrow="غرفة الفريق" title="كوّن سكوادك قبل صافرة البداية" description="اكتشف لاعبين مناسبين لمستواك، تعرّف عليهم، ثم نسّق المباراة من الشات." action={<div className="page-heading-actions"><button className="button-outline compact-button" onClick={() => setLocation("/chat")}><MessageCircle size={16} /> الشات والدعم</button><button className="button-primary compact-button" onClick={() => setLocation("/play")}><Plus size={16} /> مباراة جديدة</button></div>} />
    <section className="panel-card squad-intro"><div><span className="eyebrow">ملعبك يبدأ بفريقك</span><h2>لاعب مناسب، تمريرة أسرع، ماتش أحسن</h2><p>افتح ملف اللاعب، أرسل طلب صداقة، وبعد القبول ابدأوا محادثة خاصة. غرفة دعم الإدارة مثبتة دائماً داخل الشات.</p></div><div className="squad-intro-mark"><Users size={24} /><b>{players.length}</b><small>اقتراح متاح</small></div></section>
    <section className="panel-card squad-search-panel">
      <label className="players-search-input"><Search size={17} /><input value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="ابحث بالاسم أو المركز أو المستوى" aria-label="ابحث عن لاعب لإضافته إلى السكواد" /></label>
      <label className="players-position-filter"><span>مركز اللعب</span><select value={position} onChange={event => setPosition(event.target.value)}><option value="">كل المراكز</option><option value="goalkeeper">حارس مرمى</option><option value="defender">مدافع</option><option value="midfielder">لاعب وسط</option><option value="forward">مهاجم</option></select></label><label className="players-position-filter"><span>مستوى اللعب</span><select value={skillLevel} onChange={event => setSkillLevel(event.target.value)}><option value="">كل المستويات</option><option value="مبتدئ">مبتدئ</option><option value="متوسط">متوسط</option><option value="متقدم">متقدم</option><option value="محترف">محترف</option></select></label>
      <small className="muted">اضغط على أي لاعب لفتح ملفه. طلب الصداقة يسبق المحادثة الخاصة، بينما شات الإدارة والدعم متاح من زر الشات.</small>
    </section>
    <section className="players-directory-section"><div className="players-section-head"><h2>{hasFilters ? "نتائج البحث داخل السكواد" : "اقتراحات قريبة منك"}</h2><span>{players.length} لاعب</span></div>
      {suggestionsQuery.isLoading || searchQuery.isLoading ? <div className="panel-card players-empty"><LoaderCircle className="spin" /> جارٍ تحميل اللاعبين…</div> : (hasFilters ? searchQuery.isError : suggestionsQuery.isError) ? <div className="panel-card players-empty"><Users size={22} /><h3>تعذر تحميل اللاعبين</h3><p>تأكد من اتصالك ثم جرّب البحث مرة أخرى.</p></div> : players.length ? <div className="players-grid">{players.map((player: Item) => <article className="panel-card player-card" key={player.id}><button className="player-card-main" onClick={() => setLocation(`/players/${player.id}`)}><span className="player-avatar">{player.avatarUrl ? <img src={player.avatarUrl} alt="" loading="lazy" /> : (player.name || "ب").charAt(0)}</span><span className="player-match-badge">{player.matchScore != null ? `${player.matchScore}% توافق` : "اقتراح مناسب"}</span><h3>{player.name || "لاعب"}</h3><p>{player.position || "مركز غير محدد"}{player.skillLevel ? ` · ${player.skillLevel}` : ""}</p><small>{player.matchReason || player.bio || "متاح لتكوين فريق"}</small></button><button className="button-outline compact-button" onClick={() => setLocation(`/players/${player.id}`)}><Users size={14} /> عرض الملف وإضافة</button></article>)}</div> : <div className="panel-card players-empty"><Users size={22} /><h3>{hasFilters ? "لا توجد نتائج مطابقة" : "لا توجد اقتراحات متاحة بعد"}</h3><p>{hasFilters ? "جرّب اسماً أو مركزاً أو مستوى آخر." : "فعّل ظهور ملفك من الإعدادات، وسيظهر لك اللاعبون المتاحون لتكوين فريق."}</p><button className="button-outline compact-button" onClick={() => setLocation("/settings")}>إعدادات ظهور الملف <ArrowLeft size={14} /></button></div>}
    </section>
  </>;
}

function ChatPreview() { return <ChatPreviewPanel />; }

function ChatPage({ user }: { user: User | null }) {
  const [location, setLocation] = useLocation();
  const [activeRoom, setActiveRoom] = useState<number | null>(null);
  const requestedRoom = Number(new URLSearchParams(window.location.search).get("room")) || null;
  const [message, setMessage] = useState("");
  const [replyingTo, setReplyingTo] = useState<Item | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [callState, setCallState] = useState<{ roomId: number; mode: "audio" | "video"; incoming?: any } | null>(null);
  const [reactionTarget, setReactionTarget] = useState<number | null>(null);
  const [notificationsMuted, setNotificationsMuted] = useState(false);
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStartRef = useRef(0);
  const recordingTimerRef = useRef<number | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const observedReadMessageKeysRef = useRef<Set<string>>(new Set());
  const roomMessageSnapshotRef = useRef<Map<number, number>>(new Map());
  const utils = trpc.useUtils();
  const roomsQuery = api.chat.rooms.useQuery(undefined, { enabled: Boolean(user), retry: false, refetchInterval: 8_000, refetchIntervalInBackground: true });
  const callInboxQuery = api.chat.callInbox.useQuery(undefined, { enabled: Boolean(user), retry: false, refetchInterval: 2_000, refetchIntervalInBackground: true });
  const rooms = itemsOf(roomsQuery.data);
  const selected = activeRoom ?? (rooms.some(room => room.id === requestedRoom) ? requestedRoom : null) ?? (Number(rooms[0]?.id || 0) || null);
  const selectedRoom = rooms.find(room => room.id === selected);
  useEffect(() => {
    const incoming = callInboxQuery.data?.items?.[0];
    if (!callState && incoming) {
      let mode: "audio" | "video" = "audio";
      try { const payload = JSON.parse(incoming.payload || "{}"); mode = payload.mode === "video" || payload.sdp?.includes("m=video") ? "video" : "audio"; } catch { /* keep audio fallback */ }
      setCallState({ roomId: incoming.roomId, mode, incoming });
    }
  }, [callInboxQuery.data, callState]);
  const notificationMuteKey = `elbarzily:chat-muted:${user?.id ?? "guest"}:${selected ?? "none"}`;
  const peer = (selectedRoom?.participants || []).find((participant: Item) => participant.id !== user?.id);
  const messagesQuery = api.chat.messages.useQuery({ roomId: selected }, { enabled: Boolean(user && selected), retry: false, refetchInterval: 4_000, refetchIntervalInBackground: true });
  useEffect(() => {
    if (!user || !rooms.length) return;
    for (const room of rooms as Item[]) {
      const latestId = Number(room.lastMessageId || 0);
      const previousId = roomMessageSnapshotRef.current.get(Number(room.id));
      roomMessageSnapshotRef.current.set(Number(room.id), latestId);
      if (!latestId || previousId == null || latestId <= previousId || Number(room.id) === selected) continue;
      const sender = room.lastMessageSenderName || room.title || "شخص";
      const body = room.lastMessage || "رسالة جديدة";
      try {
        if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification(sender, { body, icon: "/brzly-logo.svg", tag: `chat-${room.id}` });
      } catch { /* native desktop notification is optional */ }
    }
  }, [rooms, selected, user]);
  useEffect(() => {
    if (!user || typeof Notification === "undefined" || Notification.permission !== "default") return;
    void Notification.requestPermission().catch(() => undefined);
  }, [user]);
  const markReadMutation = api.chat.markRead.useMutation({ onSuccess: () => { void Promise.all([roomsQuery.refetch(), messagesQuery.refetch()]); } });
  const markRead = markReadMutation.mutate;
  const sendMutation = api.chat.send.useMutation();
  const deleteMutation = api.chat.deleteMessage.useMutation();
  const uploadVoice = api.uploads.voice.useMutation();
  const uploadMedia = api.uploads.chatMedia.useMutation();
  const reactMutation = api.chat.react.useMutation();
  const blockMutation = api.social.blocks.block.useMutation();
  const unblockMutation = api.social.blocks.unblock.useMutation();
  const messages = itemsOf(messagesQuery.data);
  useEffect(() => { try { setNotificationsMuted(window.localStorage.getItem(notificationMuteKey) === "true"); } catch { setNotificationsMuted(false); } }, [notificationMuteKey]);
  useEffect(() => { setProfileOpen(false); setReactionTarget(null); }, [selected]);
  useEffect(() => { observedReadMessageKeysRef.current.clear(); }, [selected]);
  useEffect(() => {
    const root = messagesContainerRef.current;
    if (!user || !selected || !root || !messages.length || typeof IntersectionObserver === "undefined") return;
    const incomingIds = new Set(messages.filter((item: Item) => item.senderId !== user.id).map((item: Item) => String(item.id)));
    const observer = new IntersectionObserver(entries => {
      if (document.visibilityState !== "visible") return;
      const visibleIds: number[] = [];
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.6) continue;
        const element = entry.target as HTMLElement;
        const id = Number(element.dataset.chatMessageId);
        const key = `${selected}:${id}`;
        if (!id || !incomingIds.has(String(id)) || observedReadMessageKeysRef.current.has(key)) continue;
        observedReadMessageKeysRef.current.add(key);
        visibleIds.push(id);
      }
      if (visibleIds.length) markRead({ roomId: selected, messageIds: visibleIds }, { onError: () => visibleIds.forEach(id => observedReadMessageKeysRef.current.delete(`${selected}:${id}`)) });
    }, { root, threshold: [0.6] });
    root.querySelectorAll<HTMLElement>("[data-chat-message-id]").forEach(element => {
      if (incomingIds.has(element.dataset.chatMessageId || "")) observer.observe(element);
    });
    return () => observer.disconnect();
  }, [selected, messages, user?.id, markRead]);
  useEffect(() => { const field = messageInputRef.current; if (!field) return; field.style.height = "auto"; field.style.height = `${Math.min(field.scrollHeight, 132)}px`; }, [message]);
  const chatTargetId = Number(peer?.id || selectedRoom?.peerId || selectedRoom?.otherUserId || messages.find((item: Item) => item.senderId !== user?.id)?.senderId || 0) || 0;
  const canBlockPeer = Boolean(user && chatTargetId && selectedRoom?.roomType === "direct");
  const blockStatusQuery = api.social.blocks.status.useQuery({ userId: chatTargetId }, { enabled: canBlockPeer, retry: false });
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" }); }, [messages.length, selected]);
  useEffect(() => () => { if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current); recorderRef.current?.stream.getTracks().forEach(track => track.stop()); }, []);
  const refreshChat = async () => { if (!selected) return; await Promise.all([utils.chat.messages.invalidate({ roomId: selected }), utils.chat.rooms.invalidate()]); };
  const toggleNotificationsMuted = () => setNotificationsMuted(current => { const next = !current; try { window.localStorage.setItem(notificationMuteKey, String(next)); } catch { /* storage is optional */ } return next; });
  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!message.trim() || !selected) return;
    try { await sendMutation.mutateAsync({ roomId: selected, body: message.trim(), replyToMessageId: replyingTo?.id }); setMessage(""); setReplyingTo(null); await refreshChat(); }
    catch (error: any) { toast.error(errorText(error, "تعذر إرسال الرسالة.")); }
  };
  const insertEmoji = (emoji: string) => {
    const field = messageInputRef.current;
    const start = field?.selectionStart ?? message.length;
    const end = field?.selectionEnd ?? start;
    const next = `${message.slice(0, start)}${emoji}${message.slice(end)}`;
    setMessage(next);
    requestAnimationFrame(() => {
      field?.focus();
      field?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };
  const stopRecording = () => {
    if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };
  const toggleRecording = async () => {
    if (recording) { stopRecording(); return; }
    if (!selected) return;
    if (!window.isSecureContext) {
      toast.error("التسجيل الصوتي يحتاج اتصالاً آمناً HTTPS. افتح أحدث رابط للتطبيق ثم أعد المحاولة.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("هذا المتصفح لا يدعم تسجيل الرسائل الصوتية.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const formats = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm", "audio/ogg"];
      const mimeType = formats.find(format => MediaRecorder.isTypeSupported(format));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recordingStartRef.current = Date.now();
      setRecordingSeconds(0);
      setRecording(true);
      recorderRef.current = recorder;
      recorder.onstop = () => {
        if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
        stream.getTracks().forEach(track => track.stop());
        recorderRef.current = null;
        setRecording(false);
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        const durationSeconds = Math.max(1, Math.min(60, Math.ceil((Date.now() - recordingStartRef.current) / 1000)));
        if (!blob.size) { toast.error("لم يُسجل أي صوت."); return; }
        if (blob.size > 8 * 1024 * 1024) { toast.error("التسجيل أكبر من الحد المسموح (8 ميغابايت)."); return; }
        const reader = new FileReader();
        reader.onerror = () => toast.error("تعذر تجهيز التسجيل الصوتي.");
        reader.onload = async () => {
          try {
            if (!selected) return;
            const dataBase64 = String(reader.result || "").split(",", 2)[1] || "";
            const extension = blob.type.includes("ogg") ? "ogg" : "webm";
            const uploaded = await uploadVoice.mutateAsync({ fileName: `voice-${Date.now()}.${extension}`, mimeType: blob.type || "audio/webm", dataBase64, durationSeconds });
            await sendMutation.mutateAsync({ roomId: selected, messageType: "voice", mediaAssetId: uploaded.assetId, durationSeconds, replyToMessageId: replyingTo?.id });
            setReplyingTo(null);
            await refreshChat();
          } catch (error: any) { toast.error(errorText(error, "تعذر إرسال التسجيل الصوتي.")); }
        };
        reader.readAsDataURL(blob);
      };
      recorder.start(250);
      recordingTimerRef.current = window.setInterval(() => {
        const elapsed = Math.min(60, Math.ceil((Date.now() - recordingStartRef.current) / 1000));
        setRecordingSeconds(elapsed);
        if (elapsed >= 60 && recorder.state === "recording") recorder.stop();
      }, 500) as unknown as number;
    } catch (error: any) { setRecording(false); toast.error(microphoneErrorMessage(error?.name)); }
  };
  const deleteMessage = async (messageId: number, scope: "me" | "everyone") => {
    try { await deleteMutation.mutateAsync({ messageId, scope }); await refreshChat(); toast.success(scope === "me" ? "حُذفت الرسالة من قائمتك." : "حُذفت الرسالة للجميع."); }
    catch (error: any) { toast.error(errorText(error, "تعذر حذف الرسالة.")); }
  };
  const sendMedia = async (file?: File) => {
    if (!file || !selected) return;
    const messageType = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "file";
    const maxMb = messageType === "video" ? 30 : 10;
    if (file.size > maxMb * 1024 * 1024) { toast.error(`الملف أكبر من الحد المسموح (${maxMb} ميغابايت).`); return; }
    try { const dataBase64 = (await fileToDataUrl(file)).split(",", 2)[1] || ""; const uploaded = await uploadMedia.mutateAsync({ fileName: file.name, mimeType: file.type || "application/octet-stream", dataBase64, messageType }); await sendMutation.mutateAsync({ roomId: selected, messageType, mediaAssetId: uploaded.assetId, replyToMessageId: replyingTo?.id }); setReplyingTo(null); await refreshChat(); }
    catch (error: any) { toast.error(errorText(error, "تعذر إرسال الملف.")); }
  };
  const react = async (messageId: number, emoji: string) => { try { await reactMutation.mutateAsync({ messageId, emoji }); await refreshChat(); } catch (error: any) { toast.error(errorText(error, "تعذر إضافة التفاعل.")); } };
  const toggleBlockPeer = async () => {
    if (!chatTargetId) return;
    const wasBlocked = Boolean(blockStatusQuery.data?.blocked);
    try {
      if (wasBlocked) await unblockMutation.mutateAsync({ userId: chatTargetId });
      else await blockMutation.mutateAsync({ userId: chatTargetId });
      await Promise.all([blockStatusQuery.refetch(), roomsQuery.refetch()]);
      toast.success(wasBlocked ? "تم إلغاء الحظر ويمكنك التواصل مجدداً." : "تم حظر المستخدم.");
    } catch (error: any) { toast.error(errorText(error, wasBlocked ? "تعذر إلغاء الحظر." : "تعذر حظر المستخدم.")); }
  };
  const openSenderProfile = (sender: Item) => {
    if (sender.senderId === user?.id) { setLocation("/profile"); return; }
    // الحسابات القديمة قد لا تحتوي accountType رغم أن role يحدد أنها لاعب.
    if (sender.senderRole === "player" || sender.senderAccountType === "player") { setLocation(`/players/${sender.senderId}`); return; }
    toast.info("هذا الحساب إداري أو صاحب ملعب، وملف المتابعة متاح للاعبين فقط.");
  };
  if (!user) return <SignInGate title="الشات أحلى معاك" text="سجّل الدخول لتبدأ محادثات أصحابك وتنسيق مبارياتكم." />;
  const supportRoom = selectedRoom?.roomType === "support";
  const supportName = "إدارة البرازيلي والدعم";
  const isAdminView = user.role === "admin" || user.role === "super_admin" || user.role === "moderator";
  const supportContact = supportRoom ? selectedRoom?.supportContact : null;
  const roomName = supportRoom ? (isAdminView ? supportContact?.name || supportName : supportName) : selectedRoom?.title || "محادثة الملعب";
  const peerStatus = peer?.isOnline ? "متصل الآن" : peer?.lastSeenAt ? `آخر ظهور ${new Date(peer.lastSeenAt).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}` : "محادثة البرازيلي";
  const openConversationProfile = () => {
    if (supportRoom) setProfileOpen(true);
    else if (peer?.id) openSenderProfile({ senderId: peer.id, senderAccountType: peer.accountType, senderRole: peer.role });
  };
  const jumpToMessage = (messageId: number) => {
    setProfileOpen(false);
    window.setTimeout(() => document.getElementById(`chat-message-${messageId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  };
  return (
    <div className="chat-page-shell">
      <div className="chat-page-heading"><PageHeading eyebrow="تواصل سريع" title="الشات" description="محادثاتك الخاصة والعامة، بالصور والفيديو والملفات والتسجيلات الصوتية." action={<button className="button-outline compact-button" onClick={() => setLocation("/squad")}><Users size={16} /> اكتشف السكواد</button>} /></div>
      {rooms.length === 0 ? <div className="chat-empty-state"><EmptyState icon={MessageCircle} title="ابدأ أول محادثة" text="عندما تنضم لمباراة أو تبدأ التنسيق مع ملعب، ستظهر محادثتك هنا." /></div> : (
        <div className="chat-layout">
          <aside className="chat-rooms" aria-label="قائمة المحادثات">
            {rooms.map(room => {
              const isSupport = room.roomType === "support";
              return <button key={room.id} className={`chat-room ${room.id === selected ? "active" : ""} ${room.pinned ? "support-pinned" : ""}`} onClick={() => setActiveRoom(room.id)}>
                <span className="room-avatar">{isSupport && isAdminView && room.supportContact?.avatarUrl ? <img src={room.supportContact.avatarUrl} alt="" onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = "/brzly-logo.svg"; }} /> : isSupport ? <ShieldCheck size={18} /> : (room.title || room.name || "م").charAt(0)}</span>
                <span><b>{isSupport ? (isAdminView ? room.supportContact?.name || supportName : supportName) : room.title || room.name || "محادثة الملعب"}{room.pinned && <em className="chat-pinned-label">مثبت</em>}</b><small>{isSupport ? <>{isAdminView && room.supportContact?.isOnline ? <i className="chat-online-dot" /> : null}{isAdminView ? room.supportContact?.email || "محادثة عميل" : <><i className="chat-online-dot" /> متصل الآن</>}</> : room.lastMessage || "ابدأ الحديث"}</small></span>
                {room.unreadCount > 0 && <i>{room.unreadCount}</i>}
              </button>;
            })}
          </aside>
          <section className="chat-conversation" aria-label={`محادثة ${roomName}`}>
            <div className="chat-conversation-head">
              <button type="button" className="chat-header-avatar" onClick={openConversationProfile} aria-label={`فتح ملف ${roomName}`}>
                {supportRoom && isAdminView && supportContact?.avatarUrl ? <img src={supportContact.avatarUrl} alt="" onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = "/brzly-logo.svg"; }} /> : supportRoom ? <img src="/brzly-logo.svg" alt="" /> : peer?.avatarUrl ? <img src={peer.avatarUrl} alt="" onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = "/brzly-logo.svg"; }} /> : <span>{(roomName || "م").charAt(0)}</span>}
              </button>
              <button type="button" className="chat-header-info" onClick={openConversationProfile}>
                <span className="chat-title-line"><b>{roomName}</b>{supportRoom && <BadgeCheck size={18} aria-label="حساب موثّق" />}</span>
                <small>{supportRoom ? <>{isAdminView ? (supportContact?.isOnline ? <><i className="chat-online-dot" /> متصل الآن</> : supportContact?.lastSeenAt ? `آخر ظهور ${new Date(supportContact.lastSeenAt).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}` : "عميل الدعم") : <><i className="chat-online-dot" /> متصل الآن · المحادثة مثبتة</>}</> : peerStatus}</small>
              </button>
              {canBlockPeer && <button type="button" className={`chat-block-button${blockStatusQuery.data?.blocked ? " is-unblock" : ""}`} onClick={() => void toggleBlockPeer()} disabled={blockMutation.isPending || unblockMutation.isPending} title={blockStatusQuery.data?.blocked ? "إلغاء الحظر" : "حظر المستخدم"} aria-label={blockStatusQuery.data?.blocked ? "إلغاء الحظر" : "حظر المستخدم"}>{blockStatusQuery.data?.blocked ? <ShieldOff size={16} /> : <Shield size={16} />}<span className="chat-block-label">{blockStatusQuery.data?.blocked ? "إلغاء الحظر" : "حظر"}</span></button>}
              {selectedRoom?.roomType === "direct" && chatTargetId > 0 && <div className="chat-call-buttons"><button type="button" onClick={() => setCallState({ roomId: selectedRoom.id, mode: "audio" })} aria-label="اتصال صوتي"><PhoneCall size={17} /></button><button type="button" onClick={() => setCallState({ roomId: selectedRoom.id, mode: "video" })} aria-label="مكالمة فيديو"><Video size={17} /></button></div>}
              <button type="button" className="chat-header-action" onClick={openConversationProfile} aria-label="فتح ملف وخيارات المحادثة"><MoreHorizontal size={20} /></button>
            </div>

            <div ref={messagesContainerRef} className="chat-messages" aria-live="polite">
              {messagesQuery.isLoading ? <LoadingLine label="جارٍ تحميل الرسائل…" /> : messages.map((item: Item, index: number) => {
                const mine = item.senderId === user.id;
                const groupedReactions = Object.entries((item.reactions || []).reduce((counts: Record<string, number>, reaction: Item) => { counts[reaction.emoji] = (counts[reaction.emoji] || 0) + 1; return counts; }, {}));
                const isRead = Boolean(item.isRead || item.readBy?.length > 0);
                const quotedText = item.quotedMessage?.messageType === "voice" ? "رسالة صوتية" : item.quotedMessage?.messageType === "text" ? item.quotedMessage.body : item.quotedMessage?.messageType === "image" ? "صورة" : item.quotedMessage?.messageType === "video" ? "فيديو" : "ملف";
                return <article id={`chat-message-${item.id}`} data-chat-message-id={item.id} key={item.id || index} className={`chat-bubble ${mine ? "mine" : ""}`}>
                  <button type="button" className="chat-sender" onClick={() => openSenderProfile(item)}><span className="chat-sender-avatar">{item.senderAvatarUrl ? <img src={item.senderAvatarUrl} alt="" onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = "/brzly-logo.svg"; }} /> : (item.senderName || (mine ? "أنت" : "ل")).charAt(0)}</span><b>{item.senderName || (mine ? "أنت" : supportRoom ? supportName : "لاعب")}</b>{supportRoom && !mine && <BadgeCheck size={14} className="chat-sender-verified" aria-label="حساب موثّق" />}</button>
                  {item.quotedMessage && <button type="button" className="chat-quoted-message" onClick={() => jumpToMessage(item.quotedMessage.id)} aria-label={`الانتقال إلى رسالة ${item.quotedMessage.senderName || "مقتبسة"}`}><b>{item.quotedMessage.senderName || "رسالة مقتبسة"}</b><span>{quotedText || "رسالة مقتبسة"}</span></button>}
                  {item.messageType === "voice" ? <VoiceNotePlayer messageId={item.id} durationSeconds={item.durationSeconds} /> : item.messageType === "text" ? <p>{item.body || item.content || item.message}</p> : <ChatMediaPreview messageId={item.id} messageType={item.messageType} fileName={item.fileName} />}
                  {groupedReactions.length > 0 && <div className="chat-reactions">{groupedReactions.map(([emoji, count]) => <button type="button" key={emoji} onClick={() => void react(item.id, emoji)}>{emoji} {String(count)}</button>)}</div>}
                  <div className="chat-message-meta"><small>{item.createdAt ? new Date(item.createdAt).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }) : ""}{isAdminView && mine && item.readBy?.length > 0 ? ` · تمت القراءة (${item.readBy.length})` : ""}</small>{mine && <MessageReadReceipt read={isRead} />}</div>
                  <div className="chat-message-actions">
                    <button type="button" title="الرد على الرسالة" onClick={() => { setReplyingTo(item); messageInputRef.current?.focus(); }}><MessageSquareText size={14} /> رد</button>
                    <button type="button" title="اختيار تفاعل" onClick={() => setReactionTarget(reactionTarget === item.id ? null : item.id)} aria-expanded={reactionTarget === item.id}><Smile size={14} /> تفاعل</button>
                    <button type="button" title="حذف لدي" onClick={() => void deleteMessage(item.id, "me")} disabled={deleteMutation.isPending}><Trash2 size={13} /> حذف لدي</button>
                    {mine && <button type="button" title="حذف للجميع" onClick={() => void deleteMessage(item.id, "everyone")} disabled={deleteMutation.isPending}><X size={13} /> حذف للجميع</button>}
                  </div>
                  {reactionTarget === item.id && <div className="chat-reaction-picker" aria-label="اختر تفاعلاً">{QUICK_REACTIONS.map(emoji => <button type="button" key={emoji} onClick={() => { void react(item.id, emoji); setReactionTarget(null); }} aria-label={`تفاعل ${emoji}`}>{emoji}</button>)}</div>}
                </article>;
              })}
              <div ref={bottomRef} />
            </div>

            <form className={`chat-compose${replyingTo ? " is-replying" : ""}${recording ? " is-recording" : ""}`} onSubmit={send}>
              {replyingTo && <div className="chat-reply-preview"><span><b>الرد على {replyingTo.senderName || "رسالة"}</b><small>{replyingTo.messageType === "voice" ? "رسالة صوتية" : replyingTo.messageType === "text" ? replyingTo.body : replyingTo.messageType === "image" ? "صورة" : replyingTo.messageType === "video" ? "فيديو" : "ملف"}</small></span><button type="button" aria-label="إلغاء الرد" onClick={() => setReplyingTo(null)}><X size={15} /></button></div>}
              <div className="chat-compose-row">
                <label className="chat-attach-button" title="إرسال صورة أو فيديو أو ملف" aria-label="إرفاق صورة أو ملف"><Paperclip size={18} /><input type="file" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={event => { void sendMedia(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>
                <QuickEmojiPicker onSelect={insertEmoji} />
                <textarea ref={messageInputRef} value={message} rows={1} onChange={event => setMessage(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder={replyingTo ? `الرد على ${replyingTo.senderName || "الرسالة"}...` : "اكتب رسالتك..."} aria-label="نص الرسالة" />
                {recording ? <button type="button" className="chat-compose-send chat-compose-mic is-recording" onClick={toggleRecording} aria-label="إيقاف التسجيل الصوتي">{recordingSeconds}ث <X size={16} /></button>
                  : message.trim() ? <button type="submit" className="chat-compose-send" disabled={sendMutation.isPending} aria-label="إرسال الرسالة"><Send size={17} /></button>
                    : <button type="button" className="chat-compose-send chat-compose-mic" onClick={toggleRecording} disabled={uploadVoice.isPending || sendMutation.isPending} aria-label="تسجيل رسالة صوتية"><Mic size={18} /></button>}
              </div>
            </form>
          </section>
        </div>
      )}
      {supportRoom && <SupportProfileDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        messages={messages}
        muted={notificationsMuted}
        onToggleMuted={toggleNotificationsMuted}
        onCall={kind => { if (supportRoom && selected) { setProfileOpen(false); setCallState({ roomId: selected, mode: kind }); } }}
        onJumpToMessage={jumpToMessage}
        profile={isAdminView ? supportContact : undefined}
      />}
      {callState && <CallOverlay roomId={callState.roomId} peerName={callState.incoming ? (rooms.find(room => room.id === callState.roomId)?.title || "لاعب") : (selectedRoom?.title || "لاعب")} mode={callState.mode} incoming={callState.incoming} onClose={() => { setCallState(null); void callInboxQuery.refetch(); }} />}
    </div>
  );
}

function ProfilePage({ user, bookings }: { user: User | null; bookings: Item[] }) {
  const [location, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const logout = api.auth.logout.useMutation();
  const cancelMutation = api.bookings.cancel.useMutation();
  const rawBookingId = new URLSearchParams(location.split("?")[1] ?? "").get("booking");
  const focusedBookingId = rawBookingId && /^\d+$/.test(rawBookingId) ? Number(rawBookingId) : null;
  const focusedBooking = focusedBookingId ? bookings.find(item => Number(item.id) === focusedBookingId) : undefined;
  const displayedBookings = focusedBooking
    ? [focusedBooking, ...bookings.filter(item => Number(item.id) !== focusedBookingId).slice(0, 4)]
    : bookings.slice(0, 5);
  const doLogout = async () => { try { await logout.mutateAsync(); } catch { /* session may already have expired */ } window.location.assign("/join"); };

  useEffect(() => {
    if (!focusedBookingId) return;
    document.getElementById(`booking-${focusedBookingId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusedBookingId, bookings.length]);

  const cancelBooking = async (id: number) => {
    if (!window.confirm("هل تريد إلغاء هذا الحجز؟ لن يمكن التراجع عن الإلغاء.")) return;
    try {
      await cancelMutation.mutateAsync({ id });
      await utils.bookings.mine.invalidate();
      toast.success("تم إلغاء الحجز وإرسال تحديث إلى بريدك إذا كان متاحاً.");
    } catch (error: any) {
      toast.error(errorText(error, "تعذر إلغاء الحجز."));
    }
  };

  if (!user) return <SignInGate title="ملفك بانتظارك" text="سجّل الدخول لتتابع حجوزاتك وطلبات الانضمام." />;
  const canCancelBookings = user.role === "player" || user.accountType === "player";
  return <><PageHeading eyebrow="حساب اللاعب" title="ملفي الشخصي" description="بياناتك وحجوزاتك ومبارياتك في مكان واحد." action={<button className="button-outline compact-button" onClick={() => setLocation("/settings")}><Settings2 size={16} /> الإعدادات</button>} /><div className="profile-layout"><section className="profile-card"><div className="profile-cover" /><div className="profile-main"><div className="profile-avatar">{user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : (user.name || "ب").charAt(0)}</div><div className="profile-copy"><h2>{user.name || "لاعب البرازيلي"}</h2><p><AtSignIcon />{user.email}</p><span className="role-pill"><span />{user.role === "owner" || user.accountType === "owner" ? (user.role === "owner" ? "صاحب ملعب" : "طلب تفعيل ملعب") : user.role === "super_admin" || user.role === "admin" ? "مدير" : "لاعب"}</span></div><button className="button-ghost compact-button" onClick={() => setLocation("/settings")}>تعديل الملف <ArrowLeft size={15} /></button></div><div className="profile-stats"><div><b>{bookings.length}</b><small>طلبات الحجز</small></div><div><b>—</b><small>مباريات لعبتها</small></div><div><b>{user.region || "—"}</b><small>المنطقة</small></div></div></section><aside className="profile-shortcuts"><h3>إدارة حسابك</h3><button onClick={() => setLocation("/book")}><CalendarCheck2 size={17} /><span>حجوزاتي</span><ArrowLeft size={15} /></button>{(user.role === "owner" || user.accountType === "owner") && <button onClick={() => setLocation("/owner")}><Wallet size={17} /><span>لوحة الملعب</span><ArrowLeft size={15} /></button>}<button onClick={() => setLocation("/support")}><Headphones size={17} /><span>الدعم والمساعدة</span><ArrowLeft size={15} /></button><button className="logout-shortcut" onClick={doLogout}><ArrowDownLeft size={17} /><span>تسجيل الخروج</span><ArrowLeft size={15} /></button></aside></div><div className="section-header booking-history-heading"><div><h2>حجوزاتي الأخيرة</h2><p>تابع حالة طلباتك ورموز التأكيد</p></div><button className="text-link" onClick={() => setLocation("/book")}>احجز ملعباً <span>←</span></button></div>{bookings.length ? <div className="history-list">{displayedBookings.map(item => <BookingRow key={item.id} booking={item} focused={Number(item.id) === focusedBookingId} canCancel={canCancelBookings} canceling={cancelMutation.isPending} onCancel={cancelBooking} />)}</div> : <EmptyState icon={CalendarDays} title="لسه ما حجزتش ملعب" text="ابدأ بأول مباراة — الملعب المناسب مستنيك." action={<button className="button-primary" onClick={() => setLocation("/book")}>استكشف الملاعب <ArrowLeft size={16} /></button>} />}</>;
}
function AtSignIcon() { return <span aria-hidden="true">✉</span>; }
function BookingRow({ booking, focused = false, canCancel = false, canceling = false, onCancel }: { booking: Item; focused?: boolean; canCancel?: boolean; canceling?: boolean; onCancel?: (id: number) => void }) {
  const [qr, setQr] = useState("");
  useEffect(() => {
    if (!booking.qrToken || booking.status !== "approved") { setQr(""); return; }
    let active = true;
    void import("qrcode")
      .then(({ default: QRCode }) => QRCode.toDataURL(JSON.stringify({ bookingId: booking.id, token: booking.qrToken }), { width: 170, margin: 1, color: { dark: "#1f2a19", light: "#ffffff" } }))
      .then(value => { if (active) setQr(value); })
      .catch(() => { if (active) setQr(""); });
    return () => { active = false; };
  }, [booking.id, booking.qrToken, booking.status]);
  const [showQr, setShowQr] = useState(false);
  const status = booking.status === "approved" ? "مؤكد" : booking.status === "rejected" ? "مرفوض" : booking.status === "cancelled" ? "ملغي" : "قيد المراجعة";
  const startsAt = booking.startsAt ? new Date(booking.startsAt) : null;
  const mayCancel = canCancel && (booking.status === "pending" || booking.status === "approved") && startsAt && startsAt.getTime() > Date.now();
  const statusKind = booking.status === "approved" ? "success" : booking.status === "pending" ? "pending" : "danger";
  return <article id={`booking-${booking.id}`} className={`booking-row${focused ? " booking-row-focused" : ""}`}><div className={`booking-status-icon ${statusKind}`}>{booking.status === "approved" ? <Check size={17} /> : booking.status === "pending" ? <Clock3 size={17} /> : <X size={17} />}</div><div className="booking-row-main"><b>{booking.pitchName || booking.pitch?.name || "حجز ملعب"}</b><small>{startsAt ? startsAt.toLocaleDateString("ar-EG", { timeZone: "Africa/Cairo" }) : "موعد قيد التحديد"} · {startsAt ? startsAt.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Cairo" }) : ""} · حجز #{booking.id}</small></div><span className={`status-chip ${booking.status || "pending"}`}>{status}</span>{booking.status === "approved" && <button className="qr-open" onClick={() => setShowQr(v => !v)}>{showQr ? "إخفاء QR" : "عرض QR"}</button>}{mayCancel && <button className="booking-cancel-action" disabled={canceling} onClick={() => onCancel?.(Number(booking.id))}><X size={13} />{canceling ? "جارٍ الإلغاء" : booking.status === "pending" ? "إلغاء الطلب" : "إلغاء الحجز"}</button>}{showQr && qr && <img className="booking-qr" src={qr} alt="رمز تأكيد الحجز" />}</article>;
}


function OwnerBookingRow({ booking, onReview, reviewing }: { booking: Item; onReview: (booking: Item, status: "approved" | "rejected") => void; reviewing: boolean }) {
  const starts = booking.startsAt ? new Date(booking.startsAt) : null;
  const status = booking.status === "approved" ? "مؤكد" : booking.status === "rejected" ? "مرفوض" : "بانتظارك";
  return <article className="owner-booking-row"><div className={`booking-status-icon ${booking.status === "approved" ? "success" : booking.status === "rejected" ? "danger" : "pending"}`}>{booking.status === "approved" ? <Check size={17} /> : booking.status === "rejected" ? <X size={17} /> : <Clock3 size={17} />}</div><div className="owner-booking-details"><div className="owner-booking-head"><b>{booking.playerName || `لاعب #${booking.playerId || "—"}`}</b><span className={`status-chip ${booking.status || "pending"}`}>{status}</span></div><small>{booking.playerPhone ? <a href={`tel:${booking.playerPhone.replace(/[^\d+]/g, "")}`}>{booking.playerPhone}</a> : "هاتف غير متاح"}{booking.playerEmail ? ` · ${booking.playerEmail}` : ""}</small><small>{starts ? starts.toLocaleString("ar-EG") : "موعد قيد التحديد"} · {booking.fieldName || booking.field?.name || `ملعب فرعي #${booking.fieldId || "—"}`}</small><small>الدفع: {booking.paymentMethod === "arrival" ? "عند الوصول" : booking.paymentMethod === "full" ? "المبلغ كاملاً" : "العربون"} · المبلغ: {booking.paymentAmount != null ? `${money(booking.paymentAmount)} ج.م` : "—"} · الكابتن: {booking.captainName || "بدون اختيار"}{booking.captainPhone ? ` (${booking.captainPhone})` : ""}</small>{booking.receiptUrl && <a className="booking-receipt-link" href={booking.receiptUrl} target="_blank" rel="noreferrer"><ImagePlus size={13} /> عرض إيصال الدفع</a>}</div>{booking.status === "pending" && <div className="owner-booking-actions"><button className="approve-button" disabled={reviewing} onClick={() => onReview(booking, "approved")}><Check size={15} /> قبول وإصدار QR</button><button className="reject-button" disabled={reviewing} onClick={() => onReview(booking, "rejected")}><X size={15} /> رفض</button></div>}</article>;
}

function OwnerPage({ user }: { user: User | null }) {
  const [location, setLocation] = useLocation();
  const [ownerSection, setOwnerSection] = useState("summary");
  const isActiveOwner = user?.role === "owner";
  const isOwnerAccount = user?.accountType === "owner" || isActiveOwner;
  const dashboard = api.owner.dashboard.useQuery(undefined, { enabled: Boolean(isActiveOwner), retry: false });
  const savePitch = api.owner.savePitch.useMutation();
  const uploadPitchImage = api.uploads.image.useMutation();
  const updateBookingSettings = api.owner.updateBookingSettings.useMutation();
  const saveCaptains = api.owner.saveCaptains.useMutation();
  const publish = api.owner.publishSchedule.useMutation();
  const generate = api.owner.generateSchedule.useMutation();
  const reviewBooking = api.bookings.review.useMutation();
  const openSupport = api.chat.openSupport.useMutation();
  const [aiPrompt, setAiPrompt] = useState("");
  const [pitchName, setPitchName] = useState(""); const [address, setAddress] = useState(""); const [city, setCity] = useState(""); const [mapUrl, setMapUrl] = useState("");
  const [captainName, setCaptainName] = useState(""); const [captainPhone, setCaptainPhone] = useState("");
  const [morningPrice, setMorningPrice] = useState(""); const [eveningPrice, setEveningPrice] = useState("");
  const [slotStart, setSlotStart] = useState("18:00"); const [slotEnd, setSlotEnd] = useState("19:00"); const [slotDate, setSlotDate] = useState(dateKey(new Date())); const [selectedFieldId, setSelectedFieldId] = useState(""); const [subPitchCount, setSubPitchCount] = useState("1"); const [posterUrl, setPosterUrl] = useState("");
  const [vodafoneCashNumber, setVodafoneCashNumber] = useState(""); const [bookingPaymentMode, setBookingPaymentMode] = useState<"arrival" | "deposit">("arrival"); const [depositAmount, setDepositAmount] = useState("");
  const [captainRows, setCaptainRows] = useState<Array<{ id?: number; name: string; phone: string }>>([]); const [reviewingId, setReviewingId] = useState<number | null>(null);
  const data = dashboard.data as any;
  const activeFields = itemsOf(data?.fields).filter((field: Item) => Boolean(field.isActive));
  useEffect(() => { if (data?.pitch) { const pitch = data.pitch; setPitchName(pitch.name || ""); setAddress(pitch.address || ""); setCity(pitch.city || ""); setMapUrl(pitch.mapUrl || ""); setCaptainName(pitch.captainName || ""); setCaptainPhone(pitch.captainPhone || ""); setMorningPrice(String(pitch.morningPrice || "")); setEveningPrice(String(pitch.eveningPrice || "")); setSubPitchCount(String(pitch.subPitchCount || 1)); setPosterUrl(pitch.imageUrl || ""); setVodafoneCashNumber(pitch.vodafoneCashNumber || ""); setBookingPaymentMode(pitch.bookingPaymentMode === "deposit" ? "deposit" : "arrival"); setDepositAmount(String(pitch.depositAmount || "")); } if (Array.isArray(data?.captains)) setCaptainRows(data.captains.map((captain: Item) => ({ id: captain.id, name: captain.name || "", phone: captain.phone || "" }))); }, [data?.pitch, data?.captains]);
  useEffect(() => {
    if (selectedFieldId && !activeFields.some((field: Item) => String(field.id) === selectedFieldId)) setSelectedFieldId("");
  }, [data?.fields, selectedFieldId]);
  if (!user) return <SignInGate title="لوحة الكابتن" text="سجّل الدخول بحساب صاحب ملعب للوصول إلى إدارة الملعب." />;
  if (!isOwnerAccount) return <EmptyState icon={Shield} title="هذه الصفحة لأصحاب الملاعب" text="أنشئ حساب صاحب ملعب أو سجّل الدخول بحسابك." action={<button className="button-outline" onClick={() => setLocation("/join")}>إنشاء حساب صاحب ملعب</button>} />;
  if (!isActiveOwner) return <><PageHeading eyebrow="طلب تفعيل الملعب" title="اختر باقة الاشتراك" description="بعد إرسال الإيصال تراجع الإدارة تفاصيل الدفع خلال 24 ساعة. لن تُنشر صفحة الملعب قبل القبول." /><div className="notice-banner"><ShieldCheck size={18} /><div><b>الحساب بانتظار تفعيل الإدارة</b><span>اختر باقة، حوّل الرسوم، ثم ارفع صورة الإيصال ورقم العملية.</span></div></div><OwnerSubscription user={user} /></>;
  if (dashboard.isError) return <><PageHeading eyebrow="اشتراك الملعب" title="انتهت مدة الاشتراك" description="تم إيقاف إدارة الملعب والمواعيد مؤقتاً حتى تجدد الاشتراك." /><div className="notice-banner"><ShieldCheck size={18} /><div><b>لوحة الملعب مقفلة حالياً</b><span>بيانات الملعب والحجوزات محفوظة. اختر باقة جديدة وأرسل طلب التجديد لإعادة التفعيل.</span></div></div><OwnerSubscription user={user} /></>;
  const save = async (event: React.FormEvent) => { event.preventDefault(); try { const result = await savePitch.mutateAsync({ id: data?.pitch?.id, name: pitchName, address, city, mapUrl, captainName, captainPhone, morningPrice: Number(morningPrice), eveningPrice: Number(eveningPrice), subPitchCount: Number(subPitchCount), imageUrl: posterUrl || undefined }) as any; await dashboard.refetch(); if (result?.emailSent && result?.inAppNotified) toast.success("تم حفظ بيانات الملعب وإرسال تفاصيله كاملة إلى الإدارة بالبريد والتنبيهات."); else if (result?.emailSent) toast.success("تم حفظ بيانات الملعب وإرسال تفاصيله كاملة إلى بريد الإدارة."); else if (result?.inAppNotified) toast.success("تم حفظ البيانات ووصل تنبيه إلى الإدارة داخل التطبيق، لكن تعذر إرسال البريد."); else toast.error("تم حفظ البيانات، لكن تعذر إرسال إشعار الإدارة. راجع لوحة المراجعة أو تواصل مع الدعم."); } catch (error: any) { toast.error(errorText(error, "تعذر حفظ بيانات الملعب.")); } };
  const uploadPitchPoster = async (file?: File) => { if (!file) return; if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 8 * 1024 * 1024) { toast.error("ارفع صورة JPG أو PNG أو WebP حتى 8 ميغابايت."); return; } try { const dataBase64 = (await fileToDataUrl(file)).split(",", 2)[1] || ""; const uploaded = await uploadPitchImage.mutateAsync({ fileName: file.name, mimeType: file.type, dataBase64 }); setPosterUrl(String((uploaded as any).url || "")); toast.success("تم رفع صورة الملعب."); } catch (error: any) { toast.error(errorText(error, "تعذر رفع صورة الملعب.")); } };
  const savePaymentSettings = async (event: React.FormEvent) => { event.preventDefault(); const pitchId = data?.pitch?.id; if (!pitchId) return; if (bookingPaymentMode === "deposit" && Number(depositAmount) <= 0) { toast.error("أدخل مبلغ العربون أولاً."); return; } try { await updateBookingSettings.mutateAsync({ pitchId, vodafoneCashNumber: vodafoneCashNumber.trim(), bookingPaymentMode, depositAmount: Number(depositAmount || 0) }); await dashboard.refetch(); toast.success("تم حفظ إعدادات الحجز والدفع."); } catch (error: any) { toast.error(errorText(error, "تعذر حفظ إعدادات الدفع.")); } };
  const saveCaptainList = async () => { const pitchId = data?.pitch?.id; if (!pitchId) return; const captains = captainRows.map(captain => ({ name: captain.name.trim(), phone: captain.phone.trim() })).filter(captain => captain.name && captain.phone); try { await saveCaptains.mutateAsync({ pitchId, captains }); await dashboard.refetch(); toast.success("تم حفظ قائمة الكباتن."); } catch (error: any) { toast.error(errorText(error, "تعذر حفظ قائمة الكباتن.")); } };
  const getFieldId = () => activeFields.find((field: Item) => String(field.id) === selectedFieldId)?.id;
  const addSlot = async () => { const pitchId = data?.pitch?.id; const fieldId = getFieldId(); if (!pitchId || !fieldId) { toast.error(activeFields.length ? "اختر رقم الملعب الفرعي أولاً." : "احفظ بيانات الملعب أولاً."); return; } try { await publish.mutateAsync({ pitchId, fieldId, items: [{ startsAt: cairoDateTimeToIso(slotDate, slotStart), endsAt: cairoDateTimeToIso(slotDate, slotEnd), price: eveningPrice || morningPrice || "0" }] }); await dashboard.refetch(); toast.success("تم نشر الموعد."); } catch (error: any) { toast.error(errorText(error, "تعذر نشر الموعد.")); } };
  const generateSchedule = async () => { if (!aiPrompt.trim()) return; const pitchId = data?.pitch?.id; const fieldId = getFieldId(); if (!pitchId || !fieldId) { toast.error(activeFields.length ? "اختر رقم الملعب الفرعي أولاً." : "احفظ بيانات الملعب أولاً."); return; } try { const result = await generate.mutateAsync({ pitchId, fieldId, prompt: aiPrompt, date: slotDate }); const count = Array.isArray((result as any)?.items) ? (result as any).items.length : 0; toast.success(count ? `تم إنشاء ونشر ${count} موعداً.` : "تم إنشاء جدول المواعيد."); setAiPrompt(""); await dashboard.refetch(); } catch (error: any) { toast.error(errorText(error, "تعذر إنشاء الجدول. جرّب أمراً يتضمن التاريخ والأوقات.")); } };
  const contactSupport = async () => { try { const room = await openSupport.mutateAsync(); setLocation(`/squad?room=${(room as any).id}`); } catch (error: any) { toast.error(errorText(error, "تعذر فتح محادثة الدعم.")); } };
  const review = async (booking: Item, status: "approved" | "rejected") => { let note: string | undefined; if (status === "rejected") { note = window.prompt("اكتب سبب الرفض (اختياري)")?.trim() || undefined; } setReviewingId(Number(booking.id)); try { await reviewBooking.mutateAsync({ id: booking.id, status, ...(note ? { note } : {}) }); await dashboard.refetch(); toast.success(status === "approved" ? "تم قبول الحجز وإصدار QR للاعب." : "تم رفض الحجز وإشعار اللاعب."); } catch (error: any) { toast.error(errorText(error, "تعذر تحديث الحجز.")); } finally { setReviewingId(null); } };
  const bookings = itemsOf(data?.bookings); const slots = itemsOf(data?.slots); const wallet = data?.wallet || {};
  return <><PageHeading eyebrow="إدارة ملعبك" title="لوحة الكابتن" description="كل ما تحتاجه لإدارة المواعيد والحجوزات والأرباح." action={<><span className={`status-chip ${data?.pitch?.status === "published" ? "approved" : "pending"}`}>{data?.pitch?.status === "published" ? "الملعب منشور" : "صفحة الملعب قيد مراجعة الإدارة"}</span><button className="button-outline compact-button" onClick={contactSupport} disabled={openSupport.isPending}><Headphones size={15} /> دعم الإدارة</button></>} />
    {data?.pitch?.status !== "published" && <div className="notice-banner"><ShieldCheck size={18} /><div><b>صفحة الملعب غير منشورة بعد</b><span>يجب اعتماد بيانات الملعب من الإدارة قبل ظهورها للاعبين.</span></div></div>}
    <nav className="owner-section-nav" aria-label="أقسام إدارة الملعب">{[{ id: "summary", label: "ملخص" }, { id: "assistant", label: "المساعد الذكي" }, { id: "setup", label: "الملعب والمواعيد" }, { id: "captains", label: "الكباتن" }, { id: "bookings", label: "الحجوزات وQR" }, { id: "subscription", label: "الاشتراك" }].map(item => <button type="button" key={item.id} className={ownerSection === item.id ? "active" : ""} onClick={() => setOwnerSection(item.id)}>{item.label}</button>)}</nav>
    <div className={`owner-stats owner-mobile-section ${ownerSection === "summary" ? "is-active" : ""}`}><Metric label="حجوزات بانتظارك" value={bookings.filter(item => item.status === "pending").length} icon={Clock3} tone="lime" /><Metric label="مواعيد منشورة" value={slots.length} icon={CalendarDays} tone="blue" /><Metric label="إجمالي المقبوضات" value={`${money(wallet.total || 0)} ج.م`} icon={Wallet} tone="gold" /><Metric label="عمولة المنصة" value={`${money(wallet.commission || 0)} ج.م`} icon={CircleDollarSign} tone="purple" /></div>
    <div className={`owner-grid owner-mobile-section ${ownerSection === "setup" ? "is-active" : ""}`}><section className="panel-card owner-profile-panel"><div className="panel-title"><div><span className="eyebrow">ملف الملعب</span><h2>بيانات الملعب والتسعير</h2></div><Settings2 size={19} /></div><form className="owner-form" onSubmit={save}><label className="form-field"><span>اسم الملعب</span><input value={pitchName} onChange={event => setPitchName(event.target.value)} placeholder="مثال: ملعب الفرسان" required /></label><div className="two-fields"><label className="form-field"><span>عدد الملاعب الفرعية</span><input type="number" min="1" max="20" value={subPitchCount} onChange={event => setSubPitchCount(event.target.value)} /></label><label className="form-field"><span>العنوان / المنطقة</span><input value={address} onChange={event => setAddress(event.target.value)} placeholder="الحي والشارع" required /></label></div><label className="form-field"><span>المدينة أو المحافظة</span><input value={city} onChange={event => setCity(event.target.value)} placeholder="القاهرة" required /></label><label className="form-field"><span>رابط موقع Google Maps</span><input value={mapUrl} onChange={event => setMapUrl(event.target.value)} placeholder="https://maps.google.com/..." /></label><div className="two-fields"><label className="form-field"><span>اسم الكابتن الرئيسي</span><input value={captainName} onChange={event => setCaptainName(event.target.value)} placeholder="اسم المسؤول" /></label><label className="form-field"><span>رقم الكابتن الرئيسي</span><input value={captainPhone} onChange={event => setCaptainPhone(event.target.value)} placeholder="01X XXXX XXXX" /></label></div><div className="two-fields"><label className="form-field"><span>سعر الساعة صباحاً (ج.م)</span><input type="number" min="0" value={morningPrice} onChange={event => setMorningPrice(event.target.value)} placeholder="500" /></label><label className="form-field"><span>سعر الساعة مساءً (ج.م)</span><input type="number" min="0" value={eveningPrice} onChange={event => setEveningPrice(event.target.value)} placeholder="700" /></label></div><label className="form-field"><span>صورة الملعب</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => void uploadPitchPoster(event.target.files?.[0])} /><small>{uploadPitchImage.isPending ? "جارٍ رفع الصورة…" : posterUrl ? "تم اختيار صورة مرفوعة" : "إذا لم ترفع صورة، سيُنشئ النظام صورة فاخرة تلقائيًا."}</small></label>{posterUrl && <img className="owner-pitch-preview" src={posterUrl} alt="معاينة صورة الملعب" />}<button className="button-primary" disabled={savePitch.isPending || uploadPitchImage.isPending}>{savePitch.isPending ? <LoaderCircle size={17} className="spin" /> : <><Check size={17} /> حفظ بيانات الملعب</>}</button></form>
      <form className="owner-form booking-settings-form" onSubmit={savePaymentSettings}><div className="panel-title nested-title"><div><span className="eyebrow">إعدادات الحجز</span><h2>طريقة الدفع للاعبين</h2></div><Banknote size={18} /></div><label className="form-field"><span>رقم Vodafone Cash</span><input inputMode="tel" value={vodafoneCashNumber} onChange={event => setVodafoneCashNumber(event.target.value)} placeholder="01X XXXX XXXX" /></label><div className="payment-mode-options"><label><input type="radio" checked={bookingPaymentMode === "arrival"} onChange={() => setBookingPaymentMode("arrival")} /> الدفع عند الوصول</label><label><input type="radio" checked={bookingPaymentMode === "deposit"} onChange={() => setBookingPaymentMode("deposit")} /> دفع العربون مسبقاً</label></div>{bookingPaymentMode === "deposit" && <label className="form-field"><span>مبلغ العربون (ج.م)</span><input type="number" min="1" value={depositAmount} onChange={event => setDepositAmount(event.target.value)} placeholder="200" required /></label>}<p className="panel-intro">هذه الإعدادات تحفظ بمتحولة مستقلة ولا تعيد الملعب للمراجعة.</p><button className="button-outline" disabled={updateBookingSettings.isPending}><Check size={16} /> حفظ إعدادات الحجز</button></form>
    </section>
    <section className="panel-card schedule-panel"><div className="panel-title"><div><span className="eyebrow">المواعيد المتاحة</span><h2>انشر جدول اللعب</h2></div><CalendarCheck2 size={19} /></div><p className="panel-intro">انشر موعداً أو استخدم المساعد لتوليد جدول حقيقي لهذا التاريخ.</p><label className="form-field"><span>تاريخ اللعب</span><input type="date" value={slotDate} min={dateKey(new Date())} onChange={event => setSlotDate(event.target.value)} /></label><label className="form-field"><span>رقم الملعب</span><select value={selectedFieldId} onChange={event => setSelectedFieldId(event.target.value)} disabled={!activeFields.length} required={activeFields.length > 0}><option value="" disabled>اختر الملعب الفرعي</option>{activeFields.map((field: Item, index: number) => <option key={field.id} value={String(field.id)}>{field.name || `ملعب ${index + 1}`}</option>)}</select></label><div className="two-fields"><label className="form-field"><span>من</span><input type="time" value={slotStart} onChange={event => setSlotStart(event.target.value)} /></label><label className="form-field"><span>إلى</span><input type="time" value={slotEnd} onChange={event => setSlotEnd(event.target.value)} /></label></div><button className="button-primary full-button" onClick={addSlot} disabled={publish.isPending}>{publish.isPending ? <LoaderCircle size={17} className="spin" /> : <><Zap size={16} /> نشر الموعد الآن</>}</button><div className="ai-schedule"><div className="ai-schedule-head"><span className="ai-badge"><Sparkles size={14} /> AI</span><b>ولّد جدولك بالذكاء الاصطناعي</b></div><textarea value={aiPrompt} onChange={event => setAiPrompt(event.target.value)} placeholder="مثال: من ٥ إلى ١١ مساءً كل ساعة، بسعر ٧٠٠ جنيه" rows={4} /><button className="button-outline full-button" onClick={generateSchedule} disabled={generate.isPending || !aiPrompt.trim()}>{generate.isPending ? <LoaderCircle size={17} className="spin" /> : <><Sparkles size={16} /> إنشاء ونشر الجدول</>}</button><small>يمكنك كتابة الأمر أو استخدام الإملاء الصوتي في لوحة المفاتيح.</small></div></section></div>
    <section className={`panel-card captain-management owner-mobile-section ${ownerSection === "captains" ? "is-active" : ""}`}><div className="panel-title"><div><span className="eyebrow">فريق الملعب</span><h2>إدارة قائمة الكباتن</h2></div><Users size={19} /></div><p className="panel-intro">أضف الاسم والهاتف ليظهر الكابتن للاعب عند الحجز.</p><div className="captain-list">{captainRows.map((captain, index) => <div className="captain-editor-row" key={captain.id || index}><input value={captain.name} onChange={event => setCaptainRows(rows => rows.map((row, rowIndex) => rowIndex === index ? { ...row, name: event.target.value } : row))} placeholder="اسم الكابتن" /><input inputMode="tel" value={captain.phone} onChange={event => setCaptainRows(rows => rows.map((row, rowIndex) => rowIndex === index ? { ...row, phone: event.target.value } : row))} placeholder="01X XXXX XXXX" /><button type="button" className="icon-button" aria-label="حذف الكابتن" onClick={() => setCaptainRows(rows => rows.filter((_, rowIndex) => rowIndex !== index))}><X size={16} /></button></div>)}</div><div className="captain-actions"><button className="button-outline" type="button" onClick={() => setCaptainRows(rows => [...rows, { name: "", phone: "" }])}><Plus size={16} /> إضافة كابتن</button><button className="button-primary" type="button" onClick={saveCaptainList} disabled={saveCaptains.isPending}><Check size={16} /> حفظ القائمة</button></div></section>
    <section className={`panel-card owner-bookings owner-mobile-section ${ownerSection === "bookings" ? "is-active" : ""}`}><div className="panel-title"><div><span className="eyebrow">قرار صاحب الملعب</span><h2>الحجوزات الأخيرة</h2></div><a className="text-link" href="#qr">مسح QR <ArrowLeft size={14} /></a></div>{bookings.length ? <div className="history-list">{bookings.slice(0, 8).map(item => <OwnerBookingRow key={item.id} booking={item} onReview={review} reviewing={reviewingId === Number(item.id)} />)}</div> : <EmptyState icon={CalendarDays} title="لا توجد حجوزات بعد" text="ستظهر طلبات اللاعبين هنا بعد نشر المواعيد." />}</section><div className={`owner-mobile-section ${ownerSection === "bookings" ? "is-active" : ""}`}><LazyPage><QrCheckSection /></LazyPage></div><div className={`owner-mobile-section ${ownerSection === "subscription" ? "is-active" : ""}`}><OwnerSubscription user={user} /></div><div className={`owner-mobile-section ${ownerSection === "assistant" ? "is-active" : ""}`}><LazyPage><OwnerAssistantPage /></LazyPage></div>
  </>;
}

function OwnerSubscription({ user }: { user: User }) {
  const plansQuery = api.subscriptions.plans.useQuery(undefined, { enabled: user.role === "owner" || user.accountType === "owner", retry: false });
  const plans = itemsOf(plansQuery.data);
  const request = api.subscriptions.request.useMutation(); const upload = api.uploads.image.useMutation();
  const [planId, setPlanId] = useState<number | null>(null); const [receiptUrl, setReceiptUrl] = useState(""); const [paymentReference, setPaymentReference] = useState(""); const receiptInputRef = useRef<HTMLInputElement>(null);
  const cashNumber = (plansQuery.data as any)?.vodafoneCashNumber || "";
  const submit = async () => { if (!planId || !receiptUrl || !paymentReference.trim() || !cashNumber) { toast.error("اختر باقة، وأدخل رقم العملية، وتأكد من تجهيز رقم الدفع وإرفاق الإيصال."); return; } try { const result = await request.mutateAsync({ planId, vodafoneCashNumber: cashNumber, paymentReference: paymentReference.trim(), receiptUrl }); toast.success(result.status === "approved" ? "تمت مطابقة الإيصال وتفعيل حسابك فوراً." : result.status === "rejected" ? "تم رفض الإيصال تلقائياً لعدم مطابقته بيانات الدفع." : "تم استلام الإيصال وسيُراجع يدوياً من الإدارة."); } catch (error: any) { toast.error(errorText(error, "تعذر إرسال طلب الاشتراك.")); } };
  const handleReceipt = async (file?: File) => { if (!file) return; if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) { toast.error("اختر صورة JPG أو PNG أو WebP لا تتجاوز 5 ميغابايت."); return; } try { const dataBase64 = (await fileToDataUrl(file)).split(",")[1]; const result = await upload.mutateAsync({ fileName: file.name, mimeType: file.type, dataBase64 }); setReceiptUrl((result as any).url); toast.success("تم رفع الإيصال."); } catch (error: any) { toast.error(errorText(error, "تعذر رفع الإيصال.")); } };
  return <section className="panel-card subscription-area" id="subscription"><div className="panel-title"><div><span className="eyebrow">اشتراك الملعب</span><h2>اختر الباقة المناسبة</h2></div><Crown size={20} /></div><div className="plan-grid">{plans.length ? plans.map(plan => <button key={plan.id} className={`plan-card ${planId === plan.id ? "selected" : ""}`} onClick={() => setPlanId(plan.id)}>{plan.imageUrl && <img className="plan-card-image" src={plan.imageUrl} alt="" loading="lazy" />}<span className="plan-name">{plan.name || "باقة الملعب"}</span><b>{money(plan.price)} <small>ج.م</small></b><span>{plan.durationDays || 30} يوم</span><p>{plan.description || "ظهور لمزيد من اللاعبين وإدارة مواعيدك."}</p>{planId === plan.id && <Check className="plan-check" size={17} />}</button>) : <p className="muted">ستظهر الباقات بعد إضافتها من لوحة الإدارة.</p>}</div><div className="subscription-payment"><div><b>الدفع عبر Vodafone Cash</b><span>حوّل قيمة الاشتراك إلى الرقم التالي ثم أرفق الإيصال.</span><strong className="cash-number">{cashNumber || "رقم الدفع لم يُضف بعد من الإدارة"}</strong></div><label className="form-field"><span>رقم التحويل / مرجعه</span><input value={paymentReference} onChange={event => setPaymentReference(event.target.value)} placeholder="أدخل رقم العملية" /></label><div className="receipt-drop small-upload"><ImagePlus size={18} /><span><b>{receiptUrl ? "الإيصال مرفق" : "إرفاق الإيصال"}</b><small>{receiptUrl ? "اضغط لاختيار إيصال آخر" : "اضغط هنا لاختيار صورة التحويل"}</small></span><button type="button" className="receipt-select-button" onClick={() => receiptInputRef.current?.click()}>{receiptUrl ? "تغيير الصورة" : "اختيار صورة"}</button><input className="receipt-file-input" ref={receiptInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { void handleReceipt(event.target.files?.[0]); event.currentTarget.value = ""; }} /></div><button className="button-primary" onClick={submit} disabled={request.isPending}>{request.isPending ? <LoaderCircle size={17} className="spin" /> : <>حجز الاشتراك <ArrowLeft size={15} /></>}</button></div><p className="review-note"><Clock3 size={14} /> سيتم مراجعة تفاصيل الدفع خلال 24 ساعة وتفعيل حسابك عند التأكد من صحة البيانات.</p></section>;
}

function SupportPage({ user }: { user: User | null }) {
  const [location, setLocation] = useLocation(); const [content, setContent] = useState(""); const sendReport = api.reports.create.useMutation();
  if (!user) return <SignInGate title="الدعم معاك" text="سجّل الدخول للتواصل مع فريق الدعم ومتابعة طلبك." />;
  const send = async (event: React.FormEvent) => { event.preventDefault(); try { await sendReport.mutateAsync({ targetType: "support", targetId: 1, reason: "other", details: content.trim() }); setContent(""); toast.success("وصلت رسالتك لفريق البرازيلي."); } catch (error: any) { toast.error(errorText(error, "تعذر إرسال الرسالة.")); } };
  return <><PageHeading eyebrow="إحنا معاك" title="الدعم والمساعدة" description="اكتب استفسارك وسيتابعه فريق البرازيلي." /><section className="panel-card support-card"><span className="support-icon"><Headphones size={22} /></span><h2>كيف نقدر نساعدك؟</h2><p>اكتب تفاصيل المشكلة أو الاستفسار، وسيظهر لك إشعار عند مراجعة البلاغ.</p><form className="owner-form" onSubmit={send}><label className="form-field"><span>رسالتك</span><textarea value={content} onChange={event => setContent(event.target.value)} placeholder="اكتب رسالتك هنا..." rows={5} required /></label><button className="button-primary" disabled={sendReport.isPending}><Send size={16} /> إرسال لفريق الدعم</button></form></section></>;
}

function SignInGate({ title, text }: { title: string; text: string }) { const [, setLocation] = useLocation(); return <div className="gate-card"><span className="gate-icon"><ShieldCheck size={23} /></span><h2>{title}</h2><p>{text}</p><button className="button-primary" onClick={() => setLocation("/join")}>تسجيل الدخول <ArrowLeft size={16} /></button></div>; }
function Metric({ label, value, icon: Icon, tone }: { label: string; value: React.ReactNode; icon: any; tone: string }) { return <div className="metric-card"><span className={`metric-icon ${tone}`}><Icon size={19} /></span><span><small>{label}</small><b>{value}</b></span><i className="metric-spark">↗</i></div>; }
function LoadingLine({ label }: { label: string }) { return <div className="loading-line"><LoaderCircle size={17} className="spin" />{label}</div>; }
function LockKeyholeIcon() { return <span className="lock-emoji" aria-hidden="true">⌑</span>; }
async function fileToDataUrl(file: File): Promise<string> { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || "")); reader.onerror = () => reject(new Error("تعذر قراءة الملف")); reader.readAsDataURL(file); }); }

export default function Home() {
  const [location, setLocation] = useLocation();
  const meQuery = api.auth.me.useQuery(undefined, { retry: false, staleTime: 0, refetchOnWindowFocus: true, refetchOnReconnect: true });
  const pitchesQuery = api.pitches.list.useQuery(undefined, { retry: false });
  const bookingsQuery = api.bookings.mine.useQuery(undefined, { enabled: Boolean(meQuery.data && !(meQuery.data as any).isSuspended), retry: false });
  const user = (meQuery.data || null) as User | null;
  const pitches = itemsOf(pitchesQuery.data) as Pitch[];
  const bookings = itemsOf(bookingsQuery.data);
  const route = location.split("?")[0];
  const appOpenTarget = useMemo(() => resolveAppOpenTarget(route), [route]);
  const requestedNext = new URLSearchParams(location.split("?")[1] ?? "").get("next");
  const safeLoginNext = requestedNext && /^(?:\/|\/profile(?:\?booking=[1-9]\d*)?)$/.test(requestedNext) ? requestedNext : null;
  useEffect(() => {
    if (user && route === "/login" && safeLoginNext) setLocation(safeLoginNext);
  }, [user, route, safeLoginNext, setLocation]);
  useEffect(() => {
    if (!appOpenTarget) return;
    const webFallback = getAuthAwareOpenPath(appOpenTarget, Boolean(user));
    const userAgent = window.navigator.userAgent;
    const runningInInstalledApp = userAgent.includes("ElBarzilyDesktop/") || /;\s*wv\b/i.test(userAgent);
    if (runningInInstalledApp) {
      setLocation(webFallback);
      return;
    }
    if (/Windows NT/i.test(userAgent)) {
      let hiddenByApp = false;
      const fallbackTimer = window.setTimeout(() => window.location.replace(webFallback), 2500);
      const onVisibilityChange = () => {
        if (document.hidden) {
          hiddenByApp = true;
          window.clearTimeout(fallbackTimer);
        } else if (hiddenByApp) {
          window.location.replace(webFallback);
        }
      };
      document.addEventListener("visibilitychange", onVisibilityChange);
      try { window.location.assign(appOpenTarget.desktopUri); }
      catch { window.location.replace(webFallback); }
      return () => {
        window.clearTimeout(fallbackTimer);
        document.removeEventListener("visibilitychange", onVisibilityChange);
      };
    }
    setLocation(webFallback);
  }, [appOpenTarget, user?.id, setLocation]);
  const isDownloadRoute = route.replace(/\/+$/, "").toLowerCase() === "/download";
  useEffect(() => { const title = route === "/" ? "البرازيلي — ملعبك ومباراتك أقرب" : route === "/book" ? "احجز ملعبك | البرازيلي" : route === "/play" ? "اعمل ماتش | البرازيلي" : route === "/rewards" ? "مكافآتي | البرازيلي" : route === "/verify-rewards" ? "التحقق من المكافآت | البرازيلي" : isDownloadRoute ? "تحميل تطبيق البرازيلي الرسمي" : "البرازيلي"; document.title = title; }, [route]);
  if (isDownloadRoute) return <LazyPage><DownloadPage /></LazyPage>;
  let content: React.ReactNode;
  if (user?.isSuspended) content = <LazyPage><SuspendedAccountPage user={user} /></LazyPage>;
  else if (appOpenTarget) content = <><PageHeading eyebrow="رابط آمن · EL BARZILY" title="جاري فتح تطبيق البرازيلي" description="نجهّز لك أسرع طريق إلى الملعب والمحادثة. إذا كان التطبيق مثبتاً سيفتح تلقائياً، وإلا ستبقى تجربتك كاملة على الويب." /><section className="panel-card app-open-card"><div className="app-open-mark"><Zap size={28} /></div><div className="app-open-copy"><span className="eyebrow">اتصال سريع ومؤمّن</span><h2>ثوانٍ وتكون داخل الملعب</h2><p>لا تغلق الصفحة أثناء محاولة الفتح. يمكنك اختيار التطبيق المثبّت أو متابعة نفس الرابط داخل المتصفح.</p><div className="request-actions"><a className="button-primary" href={appOpenTarget.desktopUri}><Zap size={16} /> فتح التطبيق المثبّت</a><a className="button-outline" href={getAuthAwareOpenPath(appOpenTarget, Boolean(user))}><ShieldCheck size={16} /> المتابعة على الموقع</a></div></div><div className="app-open-steps"><span><b>01</b> محاولة الفتح</span><span><b>02</b> فحص الاتصال</span><span><b>03</b> دخول آمن</span></div></section></>;
  else if (route === "/join") content = user ? <HomeLanding user={user} pitches={pitches} /> : <AuthPanel initialMode="choose-role" />;
  else if (route === "/login") content = user ? <HomeLanding user={user} pitches={pitches} /> : <AuthPanel initialMode="login" />;
  else if (route === "/forgot") content = user ? <HomeLanding user={user} pitches={pitches} /> : <AuthPanel initialMode="forgot" />;
  else if (route === "/") content = user ? <HomeLanding user={user} pitches={pitches} /> : <AuthPanel initialMode="choose-role" />;
  else if (route === "/book" || route.startsWith("/book/")) content = <BookPitch user={user} pitches={pitches} />;
  else if (route === "/play") content = <MatchesPage user={user} pitches={pitches} />;
  else if (route === "/squad") content = <SquadPage user={user} />;
  else if (route === "/chat") content = import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "1" ? <ChatPreview /> : <ChatPage user={user} />;
  else if (route === "/profile") content = <ProfilePage user={user} bookings={bookings} />;
  else if (route === "/rewards") content = <LazyPage><RewardsPage user={user} /></LazyPage>;
  else if (route === "/verify-rewards") content = <LazyPage><VerifyRewardsPage user={user} /></LazyPage>;
  else if (route === "/owner") content = <OwnerPage user={user} />;
  else if (route === "/settings") content = <LazyPage><SettingsPage user={user} /></LazyPage>;
  else if (route === "/suggest-pitch") content = <LazyPage><PitchSuggestionPage user={user} /></LazyPage>;
  else if (route === "/support") content = <SupportPage user={user} />;
  else content = <HomeLanding user={user} pitches={pitches} />;
  return <AppShell user={user}>{content}</AppShell>;
}
