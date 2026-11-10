import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import {
  Activity, ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpLeft, BadgeCheck,
  Banknote, BarChart3, Bell, CalendarCheck2, CalendarDays, Camera, Check, CheckCheck,
  ChevronLeft, ChevronRight, CircleDollarSign, Clock3, Compass, Copy, Crown,
  Filter, FileText, Flag, Headphones, ImagePlus, LoaderCircle, MapPin, MessageCircle, ClipboardList,
  MessageSquareText, Mic, Minus, Moon, MoreHorizontal, Navigation, Paperclip, Plus, Search,
  Download, Send, Settings2, Shield, ShieldCheck, ShieldOff, Star, Sun, Trophy, Users,
  Smile, Trash2, UserRound, Wallet, X, Zap,
 LifeBuoy, LogIn,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { connectRealtime } from "../../../shared/realtime-client";
import { getOwnerSubscriptionState } from "../../../shared/subscription";
import { getAuthAwareOpenPath, resolveAppOpenTarget } from "@/lib/appLinks";
import { microphoneErrorMessage } from "@/lib/mediaPermissions";
import { isVerifiedAccount, mediaUrl } from "@/lib/mediaUrl";
import { assignUniquePitchImages, assignUniquePlanImages, defaultPitchImageForId } from "@/lib/visualAssets";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import "./chat.css";
import { MessageReadReceipt, QUICK_REACTIONS, QuickEmojiPicker, SupportProfileDialog, WaveformPlayer } from "@/features/chat/ChatPresentation";
import AuthPanel from "@/features/auth/AuthPanel";
import { AppShell, PageHeading, SectionHeader } from "@/features/app/AppShell";
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const PitchSuggestionPage = lazy(() => import("@/pages/PitchSuggestionPage"));
const QrCheckSection = lazy(() => import("@/pages/QrCheckSection"));
const SuspendedAccountPage = lazy(() => import("@/pages/SuspendedAccountPage"));
const DownloadPage = lazy(() => import("@/pages/DownloadPage"));
const RewardsPage = lazy(() => import("@/pages/RewardsPage"));
const VerifyRewardsPage = lazy(() => import("@/pages/VerifyRewardsPage"));

const api = trpc as any;
const heroImage = "/pitch-images/pitch-01.webp";
const pageLoading = <div role="status" style={{ minHeight: "20vh", display: "grid", placeItems: "center" }}>جاري تحميل الصفحة…</div>;

type User = { id: number; name?: string | null; email?: string | null; phone?: string | null; region?: string | null; role?: string; accountType?: string; status?: string; isSuspended?: boolean; moderatorPermissions?: string[] | null; avatarUrl?: string | null; ownerSubscriptionExpiresAt?: Date | string | null };
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
      if (!result.data?.url) throw new Error("الرسالة الصوتية مش متاحة");
      setUrl(result.data.url);
    } catch (error: any) {
      toast.error(error?.message || "مش قادرين نحمل الرسالة الصوتية.");
    }
  };
  return <WaveformPlayer src={url || undefined} durationSeconds={durationSeconds} loading={mediaQuery.isFetching} onRequestSource={load} label={review ? "رسالة صوتية للمراجعة" : "رسالة صوتية"} />;
}
function ChatMediaPreview({ messageId, messageType, fileName }: { messageId: number; messageType: string; fileName?: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const mediaQuery = api.chat.voiceUrl.useQuery({ messageId }, { enabled: false, retry: false });
  const load = async () => { try { const result = await mediaQuery.refetch(); if (!result.data?.url) throw new Error("الوسائط مش متاحة"); setUrl(result.data.url); } catch (error: any) { toast.error(error?.message || "مش قادرين نحمل الوسائط."); } };
  if (!url) return <button type="button" className="chat-media-load" onClick={() => void load()} disabled={mediaQuery.isFetching}><Paperclip size={14} />{mediaQuery.isFetching ? "جاري تجهيز الملف…" : messageType === "image" ? "افتح الصورة" : messageType === "video" ? "شغّل الفيديو" : `تحميل ${fileName || "الملف"}`}</button>;
  if (messageType === "image") return <img className="chat-media-image" src={url} alt={fileName || "صورة مرفقة"} loading="lazy" />;
  if (messageType === "video") return <video className="chat-media-video" controls preload="metadata" src={url} />;
  return <a className="chat-media-file" href={url} target="_blank" rel="noreferrer"><FileText size={15} />{fileName || "افتح الملف"}</a>;
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
  if (![year, month, day, hour, minute, wallTime].every(Number.isFinite)) throw new Error("الوقت مش صالح");
  let instant = wallTime;
  for (let attempt = 0; attempt < 4; attempt++) {
    const zone = cairoOffsetFormatter.formatToParts(new Date(instant)).find(part => part.type === "timeZoneName")?.value;
    const offset = zone?.match(/^GMT(?:([+-])(\d{2}):(\d{2}))?$/);
    if (!offset) throw new Error("مش قادرين نحدد توقيت القاهرة");
    const minutes = offset[1] ? (offset[1] === "+" ? 1 : -1) * (Number(offset[2]) * 60 + Number(offset[3])) : 0;
    const corrected = wallTime - minutes * 60_000;
    if (corrected === instant) return new Date(corrected).toISOString();
    instant = corrected;
  }
  return new Date(instant).toISOString();
}
function errorText(error: any, fallback: string) { const message = error?.message || ""; return /unexpected token|json|html|response/i.test(message) ? "حصلت مشكلة في رد الخادم. جرّب تاني كمان شوية." : message || fallback; }

function EmptyState({ icon: Icon = Compass, title, text, action }: { icon?: any; title: string; text: string; action?: React.ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={24} /></span><h3>{title}</h3><p>{text}</p>{action}</div>;
}

function PitchCard({ pitch, image }: { pitch: Pitch; image: string }) {
  const area = pitch.city || pitch.address || "القاهرة";
  const rate = pitch.rating ? Number(pitch.rating).toFixed(1) : "جديد";
  const price = pitch.eveningPrice ?? pitch.morningPrice;
  return <article className="pitch-card">
    <div className="pitch-card-image" style={{ backgroundImage: image ? `linear-gradient(180deg, transparent 35%, rgba(7,9,7,.82)), url("${image}")` : "linear-gradient(135deg, #122016, #27352a)" }}>
      <span className="pitch-category">ملعب كرة قدم</span>
      <button className="favorite-button" aria-label="ضيف للمفضلة" onClick={() => toast.message("سجّل دخولك الأول عشان تضيف الملعب للمفضلة.")}><span>♡</span></button>
      {pitch.verified && <span className="verified-chip"><BadgeCheck size={13} /> موثّق</span>}
      <div className="pitch-image-title"><h3>{pitch.name}</h3><span><MapPin size={13} />{area}</span></div>
    </div>
    <div className="pitch-card-body"><div className="pitch-meta"><span className="rating"><Star size={14} fill="currentColor" />{rate}{pitch.ratingCount ? <small>({pitch.ratingCount})</small> : null}</span><span className="pitch-subfields">{pitch.subPitchCount || 1} ملاعب فرعية</span></div><div className="pitch-card-bottom"><div className="pitch-price"><b>{price ? money(price) : "اسأل عن السعر"}</b><small>ج.م / ساعة</small></div><a className="small-book-button" href={`/book/${pitch.id}`}>احجز<ArrowLeft size={15} /></a></div></div>
  </article>;
}

function DateStrip({ selected, onSelect }: { selected: string; onSelect: (date: string) => void }) {
  const days = useMemo(() => {
    const [year, month, day] = dateKey(new Date()).split("-").map(Number);
    return Array.from({ length: 7 }, (_, index) => new Date(Date.UTC(year, month - 1, day + index, 12)));
  }, []);
  return <div className="date-strip">{days.map((date, index) => { const key = dateKey(date); return <button key={key} onClick={() => onSelect(key)} className={`date-cell ${selected === key ? "selected" : ""}`}><small>{index === 0 ? "النهارده" : displayDate(date).split(" ")[0]}</small><b>{new Intl.DateTimeFormat("ar-EG", { day: "numeric" }).format(date)}</b><i /></button>; })}</div>;
}

function HomeLanding({ user, pitches }: { user: User | null; pitches: Pitch[] }) {
  const [location, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [area, setArea] = useState("كل المناطق");
  const [selectedDate, setSelectedDate] = useState(dateKey(new Date()));
  const filtered = pitches.filter(pitch => `${pitch.name} ${pitch.address || ""} ${pitch.city || pitch.region || ""}`.toLowerCase().includes(search.toLowerCase()) && (area === "كل المناطق" || (pitch.city || pitch.region || pitch.address || "").includes(area)));
  const imageByPitchId = useMemo(() => assignUniquePitchImages(pitches), [pitches]);
  return <>
    <section className="hero-banner" style={{ backgroundImage: `linear-gradient(90deg, rgba(11,14,10,.97) 0%, rgba(11,14,10,.84) 39%, rgba(11,14,10,.25) 100%), linear-gradient(0deg, rgba(11,14,10,.68), transparent 55%), url("${heroImage}")` }}>
      <div className="hero-content"><div className="hero-kicker"><span className="kicker-dot" /> الكورة بتجمعنا</div><h1>الملعب <span>ينادي.</span><br />مين معاك؟</h1><p>احجز ملعبك، لمّ صحابك، ويلا نبدأ الماتش.<br className="desktop-only" /> كل اللي محتاجه عشان تلعب — في مكان واحد.</p><div className="hero-actions"><button className="button-primary" onClick={() => setLocation("/book")}><CalendarDays size={17} /> احجز ملعبك</button><button className="button-ghost" onClick={() => setLocation("/play")}><Users size={17} /> اعمل ماتش</button></div><div className="hero-note"><span><Check size={13} /> ملاعب مضمونة</span><i /><span><Check size={13} /> حجز سهل وواضح</span></div></div>
      <div className="hero-stamp"><span>اللعب</span><b>١١</b><span>بيبدأ من هنا</span><i /></div>
      <div className="hero-image-caption"><span className="caption-line" /> ليالي الملعب أحلى</div>
    </section>
    <div className="quick-search-card"><div className="search-location"><MapPin size={18} /><label><small>المنطقة</small><select value={area} onChange={event => setArea(event.target.value)}><option>كل المناطق</option><option>مدينة نصر</option><option>المعادي</option><option>التجمع</option><option>الهرم</option></select></label><ChevronDownIcon /></div><div className="search-divider" /><div className="search-date"><CalendarDays size={18} /><label><small>ميعاد اللعب</small><input type="date" value={selectedDate} min={dateKey(new Date())} onChange={event => setSelectedDate(event.target.value)} /></label></div><div className="search-divider" /><div className="search-keyword"><Search size={18} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="اسم الملعب أو المنطقة" /></div><button className="search-submit" onClick={() => setLocation("/book")}><Search size={17} /><span>دور على ملعب</span></button></div>
    <section className="section-block"><div className="feature-strip"><div className="feature-icon"><Zap size={18} /></div><div><b>ماتش على مزاجك</b><span>اختار وقتك والملعب اللي يناسبك</span></div><ArrowLeft size={17} className="feature-arrow" /></div><div className="feature-strip"><div className="feature-icon muted-feature"><Users size={18} /></div><div><b>كمّل فريقك</b><span>انضم لماتش أو كوّن سكوادك</span></div><ArrowLeft size={17} className="feature-arrow" /></div><div className="feature-strip"><div className="feature-icon"><ShieldCheck size={18} /></div><div><b>حجز مضمون</b><span>كل طلب بيتراجع بوضوح</span></div><ArrowLeft size={17} className="feature-arrow" /></div></section>
    <section className="section-block pitch-section"><SectionHeader title="ملاعب قريبة منك" subtitle="اختار الملعب اللي يناسبك" href="/book" /><div className="section-filter"><span className="live-indicator"><i /> متاح للحجز</span><button className="filter-button"><Filter size={15} /> فلتر</button></div>{filtered.length ? <div className="pitch-grid">{filtered.slice(0, 4).map(pitch => <PitchCard key={pitch.id} pitch={pitch} image={imageByPitchId.get(Number(pitch.id)) || ""} />)}</div> : <EmptyState icon={MapPin} title="ملاعب منطقتك هتظهر قريب" text="مفيش ملاعب معلنة دلوقتي. جرّب منطقة تانية أو اقترح ملعب جديد." action={<button className="button-outline" onClick={() => setLocation("/suggest-pitch")}>اقترح ملعب <ArrowLeft size={15} /></button>} />}</section>
    <section className="join-banner"><div className="join-banner-icon"><Trophy size={25} /></div><div><span className="eyebrow">اللعبة بتكمل بينا</span><h2>ناقصك لاعب؟ اعمل ماتش.</h2><p>اختار الملعب والميعاد، وسيب باب الانضمام مفتوح للاعبين.</p></div><button className="button-primary" onClick={() => setLocation(user ? "/play" : "/join")}>ابدأ ماتش <ArrowLeft size={17} /></button></section>
  </>;
}
function ChevronDownIcon() { return <span className="select-chevron">⌄</span>; }

function BookingList({ pitches }: { pitches: Pitch[] }) {
  const [location, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState(dateKey(new Date()));
  const [period, setPeriod] = useState("الكل");
  const filtered = pitches.filter(pitch => `${pitch.name} ${pitch.address || ""} ${pitch.city || pitch.region || ""}`.toLowerCase().includes(search.toLowerCase()));
  const imageByPitchId = useMemo(() => assignUniquePitchImages(pitches), [pitches]);
  return <>
    <PageHeading eyebrow="ملعبك على بُعد حجز" title="احجز ملعبك" description="اختار المنطقة والميعاد، وهنوصلك بالملعب المناسب." action={<button className="button-outline compact-button" onClick={() => setLocation("/book")}>قريب مني <Navigation size={15} /></button>} />
    <div className="booking-toolbar"><label className="toolbar-search"><Search size={17} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="دور باسم الملعب أو المنطقة" /></label><button className="filter-button"><Filter size={16} /> فلتر</button></div>
    <div className="availability-panel"><div className="panel-heading"><div><b>اختار يوم اللعب</b><small>أصحاب الملاعب بيحدّثوا المواعيد المتاحة</small></div><CalendarDays size={19} /></div><DateStrip selected={selectedDate} onSelect={setSelectedDate} /><div className="period-filter">{["الكل", "بعد الظهر", "المساء", "الليل", "بعد منتصف الليل"].map(item => <button key={item} className={period === item ? "active" : ""} onClick={() => setPeriod(item)}>{item}</button>)}</div></div>
    <div className="section-header results-heading"><div><h2>الملاعب المتاحة</h2><p>{filtered.length} ملعب في القائمة</p></div><span className="sort-label">الترتيب: <b>الأقرب</b><ChevronDownIcon /></span></div>
    {filtered.length ? <div className="pitch-grid large-grid">{filtered.map(pitch => <PitchCard key={pitch.id} pitch={pitch} image={imageByPitchId.get(Number(pitch.id)) || ""} />)}</div> : <EmptyState icon={CalendarDays} title="لسه مفيش ملاعب معلنة" text="لما أصحاب الملاعب ينشروا مواعيدهم، هتظهر هنا. وتقدر تقترح ملعب قريب منك." action={<button className="button-outline" onClick={() => setLocation("/squad")}>اقترح ملعب <ArrowLeft size={15} /></button>} />}
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
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { toast.error("ارفع صورة JPG أو PNG أو WebP."); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("حجم الإيصال ماينفعش يعدّي 5 ميجابايت."); return; }
    try { const dataBase64 = (await fileToDataUrl(file)).split(",")[1]; const result = await upload.mutateAsync({ fileName: file.name, mimeType: file.type, dataBase64 }); setReceiptUrl((result as any).url); toast.success("الإيصال اترفع."); }
    catch (error: any) { toast.error(errorText(error, "مش قادرين نرفع الإيصال.")); }
  };
  if (!pitchId) return <BookingList pitches={pitches} />;
  if (!pitch) return <><button className="back-link" onClick={() => setLocation("/book")}><ArrowRight size={16} /> كل الملاعب</button><EmptyState title="الملعب مش متاح" text="ممكن الملعب لسه ما اتنشرش أو الرابط مش صحيح." /></>;
  const selectedPaymentMethod = paymentMode === "arrival" ? "arrival" : paymentMethod;
  const amountDue = selectedSlot ? (selectedPaymentMethod === "deposit" ? depositAmount : Number(selectedSlot.price)) : 0;
  const requiresReceipt = selectedPaymentMethod === "deposit" || selectedPaymentMethod === "full";
  const pitchCoverImage = pitch.imageUrl && !pitch.imageUrl.includes("/manus-storage/") ? pitch.imageUrl : defaultPitchImageForId(pitch.id);
  const book = async () => {
    if (!user) { setLocation("/join"); return; }
    if (!selectedSlot) { toast.error("اختار ميعاد متاح الأول ويلا نكمّل."); return; }
    if (paymentMode === "deposit" && (!depositAmount || depositAmount <= 0)) { toast.error("صاحب الملعب لسه ماحددش قيمة العربون."); return; }
    if (paymentMode === "deposit" && !pitch.vodafoneCashNumber) { toast.error("صاحب الملعب لسه ما ضافش رقم Vodafone Cash."); return; }
    if (requiresReceipt && !receiptUrl) { toast.error("ارفع صورة إيصال الدفع الأول عشان تبعت الطلب."); return; }
    try {
      const bookingResult = await createBooking.mutateAsync({ pitchId, fieldId: selectedSlot.fieldId, scheduleId: selectedSlot.id, paymentMethod: selectedPaymentMethod, ...(receiptUrl ? { receiptUrl } : {}),  });
      toast.success(bookingResult.status === "approved" ? "حجزك تم يا نجم! الإيصال اتطابق وQR الحجز جاهز." : bookingResult.status === "rejected" ? "الإيصال ماتطابقش، والميعاد بقى متاح لحد تاني. راجع بيانات الدفع وجرّب تاني." : "طلب حجزك اتبعت لصاحب الملعب، أول ما يراجعه هيجيلك خبر.");
      setLocation("/profile");
    } catch (error: any) { toast.error(errorText(error, "ماقدرناش نبعت طلب الحجز، جرّب تاني كمان شوية.")); }
  };
  return <>
    <button className="back-link" onClick={() => setLocation("/book")}><ArrowRight size={16} /> العودة للملاعب</button>
    <div className="pitch-detail-layout single-column"><div className="pitch-detail-main">
      <div className="pitch-detail-cover" style={{ backgroundImage: `linear-gradient(0deg, rgba(8,10,8,.78), transparent 60%), url("${pitchCoverImage}")` }}><span className="pitch-category">ملعب كرة قدم</span><div><h1>{pitch.name}</h1><span><MapPin size={15} />{pitch.address || pitch.city || "العنوان مش متحدد"}</span></div></div>
      <div className="pitch-detail-meta"><span><Star size={15} fill="currentColor" /> {pitch.rating ? Number(pitch.rating).toFixed(1) : "جديد"}</span><span><Users size={15} /> {pitch.subPitchCount || 1} ملاعب فرعية</span>{pitch.captainPhone && <a className="captain-phone-link" href={`tel:${pitch.captainPhone}`}><PhoneIcon /> {pitch.captainName || "كابتن الملعب"}: {pitch.captainPhone}</a>}{captains.length > 0 && <><span>أرقام الكباتن:</span>{captains.map(captain => <a key={captain.id} className="captain-phone-link" href={`tel:${captain.phone}`}><PhoneIcon /> {captain.name}: {captain.phone}</a>)}</>}{pitch.mapUrl && <a href={pitch.mapUrl} target="_blank" rel="noreferrer"><Navigation size={15} /> الاتجاهات</a>}<button className="button-outline compact-button" onClick={() => setLocation(user ? "/support" : "/join")}><MessageCircle size={15} /> المساعدة والدعم</button></div>
      <div className="detail-card"><SectionHeader title="اختار يومك" subtitle="مواعيد الملعب المنشورة" /><DateStrip selected={selectedDate} onSelect={date => { setSelectedDate(date); setSelectedSlot(null); }} />
        <div className="subpitch-filter"><span>الملعب الفرعي</span><select value={subPitch} onChange={event => { setSubPitch(Number(event.target.value)); setSelectedSlot(null); }}><option value={0}>كل الملاعب</option>{fields.map(field => <option key={field.id} value={field.id}>{field.name}</option>)}</select></div>
        <div className="period-filter">{["الكل", "بعد الظهر", "المساء", "الليل", "بعد منتصف الليل"].map(item => <button key={item} className={selectedPeriod === item ? "active" : ""} onClick={() => { setSelectedPeriod(item); setSelectedSlot(null); }}>{item}</button>)}</div><div className="slot-heading"><Clock3 size={16} /><span>المواعيد المتاحة</span></div>{slotsQuery.isLoading ? <p className="muted">بنحمّل المواعيد…</p> : slots.length ? <div className="slot-grid">{slots.map((slot, index) => { const key = slot.id ?? `${slot.startsAt}-${index}`; const label = `${displayTime(slot.startsAt)} – ${displayTime(slot.endsAt)}`; return <button key={key} className={`slot-card ${selectedSlot?.id === slot.id ? "selected" : ""}`} onClick={() => setSelectedSlot(slot)}><span>{label}</span><small>{money(slot.price)} ج.م{slot.depositAmount != null && <> · عربون {money(slot.depositAmount)} ج.م</>}</small></button>; })}</div> : <EmptyState icon={Clock3} title="مفيش مواعيد منشورة لليوم ده" text="جرّب يوم تاني أو كلم صاحب الملعب." />}

      </div>
      <section className="booking-summary booking-summary-inline"><span className="eyebrow">احجز ماتشك</span><h2>كمّل حجزك</h2><p>{paymentMode === "arrival" ? "الدفع عند وصولك للملعب، ومش محتاج ترفع إيصال." : "حوّل العربون أو المبلغ كله على رقم Vodafone Cash، وبعدها ارفع الإيصال."}</p><div className="summary-line"><span>الملعب</span><b>{pitch.name}</b></div><div className="summary-line"><span>النهارده</span><b>{selectedDate}</b></div><div className="summary-line"><span>الموعد</span><b>{selectedSlot ? `${displayTime(selectedSlot.startsAt)} – ${displayTime(selectedSlot.endsAt)}` : "اختار ميعاد"}</b></div>{paymentMode === "deposit" && <div className="payment-choice"><span>طريقة الدفع</span><div><label><input type="radio" checked={selectedPaymentMethod === "deposit"} onChange={() => { setPaymentChoice("deposit"); setReceiptUrl(""); }} /> دفع العربون ({money(depositAmount)} ج.م)</label><label><input type="radio" checked={selectedPaymentMethod === "full"} onChange={() => { setPaymentChoice("full"); setReceiptUrl(""); }} /> دفع المبلغ كله ({selectedSlot ? money(selectedSlot.price) : "—"} ج.م)</label></div></div>}<div className="summary-line"><span>{paymentMode === "arrival" ? "الدفع" : "المبلغ المطلوب"}</span><b>{paymentMode === "arrival" ? "عند الوصول" : amountDue ? `${money(amountDue)} ج.م` : "هيظهر بعد ما تختار"}</b></div>{paymentMode === "deposit" && <div className="cash-payment-note"><Banknote size={16} /><span>Vodafone Cash: <strong>{pitch.vodafoneCashNumber || "صاحب الملعب لسه ماحددش الرقم"}</strong></span></div>}{requiresReceipt && <div className="receipt-drop"><label><ImagePlus size={18} /><span><b>{upload.isPending ? "جاري رفع الإيصال..." : receiptUrl ? "الإيصال اترفق" : "ارفع صورة إيصال الدفع"}</b><small>JPG أو PNG أو WebP حتى 5 MB</small></span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => handleReceipt(event.target.files?.[0])} /></label>{receiptUrl && <span className="receipt-ready"><Check size={14} /> جاهز للإرسال</span>}</div>}<button className="button-primary full-button" disabled={createBooking.isPending || upload.isPending} onClick={book}>{createBooking.isPending ? <LoaderCircle size={17} className="spin" /> : <>ابعت طلب الحجز <ArrowLeft size={16} /></>}</button><div className="booking-policy"><ShieldCheck size={14} /><span>بعد ما تبعت الطلب، هنستنى موافقة صاحب الملعب، وبعدها هيظهر QR في ملفك.</span></div></section>
    </div></div>
  </>;
}
function PhoneIcon() { return <span aria-hidden="true">☎</span>; }

function MatchesPage({ user, pitches }: { user: User | null; pitches: Pitch[] }) {
  const [location, setLocation] = useLocation(); const [creating, setCreating] = useState(false); const [pitchId, setPitchId] = useState(0); const [fieldId, setFieldId] = useState(0); const [title, setTitle] = useState(""); const [startsDate, setStartsDate] = useState(dateKey(new Date())); const [startsTime, setStartsTime] = useState("19:00"); const [maxPlayers, setMaxPlayers] = useState("10");
  const matchesQuery = api.matches.list.useQuery(undefined, { retry: false }); const joinMatch = api.matches.join.useMutation(); const createMatch = api.matches.create.useMutation();
  const fieldsQuery = api.pitches.fields.useQuery({ pitchId }, { enabled: Boolean(pitchId), retry: false }); const fields = itemsOf(fieldsQuery.data); const matches = itemsOf(matchesQuery.data);
  const join = async (match: Item) => { if (!user) { setLocation("/join"); return; } try { await joinMatch.mutateAsync({ matchId: match.id }); await matchesQuery.refetch(); toast.success("انضمّيت للماتش، يلا بينا!"); } catch (error: any) { toast.error(errorText(error, "ماقدرناش نضمك للماتش، جرّب تاني.")); } };
  const submitMatch = async (event: React.FormEvent) => { event.preventDefault(); if (!user) { setLocation("/join"); return; } if (!pitchId || !fieldId) { toast.error("اختار ملعب معتمد وملعب فرعي عشان نعمل الماتش."); return; } try { await createMatch.mutateAsync({ pitchId, fieldId, title: title.trim(), startsAt: new Date(`${startsDate}T${startsTime}:00`).toISOString(), maxPlayers: Number(maxPlayers) }); await matchesQuery.refetch(); setCreating(false); setTitle(""); toast.success("الماتش اتعمل، ناقصك تكمل الفريق!"); } catch (error: any) { toast.error(errorText(error, "ماقدرناش نعمل الماتش؛ اتأكد إنك مختار ملعب منشور وجرّب تاني.")); } };
  return <><PageHeading eyebrow="كوّن فريقك" title="اعمل ماتش" description="اعمل ماتش على ملعب مسجل وشاركه، وسيب لاعيبة منطقتك يكملوا الفريق." action={<button className="button-primary compact-button" onClick={() => user ? setCreating(value => !value) : setLocation("/join")}><Plus size={17} /> ماتش جديد</button>} /><div className="match-promo"><div className="promo-badge"><Users size={20} /></div><div><span className="eyebrow">لاعب ناقص؟ مش مشكلة.</span><h2>مباراتك الجاية تبدأ من هنا</h2><p>انضم للماتش، ولو احتجت مساعدة دوس على «المساعدة والدعم».</p></div><div className="promo-ball">⚽</div></div>
    {creating && <form className="panel-card owner-form match-create-form" onSubmit={submitMatch}><div className="panel-title"><div><span className="eyebrow">ماتش جديد</span><h2>اختار الملعب والميعاد</h2></div><Trophy size={19} /></div>{pitches.length ? <><label className="form-field"><span>الملعب المعتمد</span><select value={pitchId || ""} onChange={event => { setPitchId(Number(event.target.value)); setFieldId(0); }} required><option value="" disabled>اختار ملعب منشور</option>{pitches.map(pitch => <option key={pitch.id} value={pitch.id}>{pitch.name} — {pitch.city || pitch.address}</option>)}</select></label><label className="form-field"><span>الملعب الفرعي</span><select value={fieldId || ""} onChange={event => setFieldId(Number(event.target.value))} required><option value="" disabled>{fieldsQuery.isLoading ? "بنحمّل…" : "اختار الملعب الفرعي"}</option>{fields.map(field => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label><label className="form-field"><span>اسم الماتش</span><input value={title} onChange={event => setTitle(event.target.value)} placeholder="ماتش خماسي ودي" required /></label><div className="two-fields"><label className="form-field"><span>التاريخ</span><input type="date" min={dateKey(new Date())} value={startsDate} onChange={event => setStartsDate(event.target.value)} required /></label><label className="form-field"><span>ميعاد البداية</span><input type="time" value={startsTime} onChange={event => setStartsTime(event.target.value)} required /></label></div><label className="form-field"><span>أقصى عدد لاعيبة</span><input type="number" min="2" max="50" value={maxPlayers} onChange={event => setMaxPlayers(event.target.value)} /></label><button className="button-primary" disabled={createMatch.isPending}>{createMatch.isPending ? <LoaderCircle size={17} className="spin" /> : <>اعمل الماتش <ArrowLeft size={16} /></>}</button></> : <p className="muted">لسه مفيش ملاعب منشورة، ومينفعش تعمل ماتش برّه ملعب مسجل.</p>}</form>}
    <SectionHeader title="مباريات مفتوحة" subtitle="انضم لماتش يناسب مستواك ووقتك" /><div className="match-list">{matchesQuery.isLoading ? <LoadingLine label="بنحمّل الماتشات…" /> : matches.length ? matches.map(match => { const startsAt = new Date(match.startsAt); return <article key={match.id} className="match-card"><div className="match-date-badge"><small>{startsAt.toLocaleDateString("ar-EG", { month: "short" })}</small><b>{startsAt.getDate()}</b></div><div className="match-card-info"><span className="match-status"><i />{match.status === "full" ? "الفريق كمل" : "لسه فيها مكان"}</span><h3>{match.title || "ماتش كورة"}</h3><p><MapPin size={14} />{match.pitchName || "ملعب مسجل"} <i /> <Clock3 size={14} />{startsAt.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}</p></div><div className="match-players"><div className="mini-avatars"><span>ع</span><span>م</span><span>+</span></div><small>{match.joinedCount || 1}/{match.maxPlayers || 10} لاعبين</small></div><button className="button-outline compact-button" onClick={() => join(match)} disabled={joinMatch.isPending || match.status === "full"}>{match.status === "full" ? "كملت" : "انضم للماتش"}<ArrowLeft size={15} /></button></article>; }) : <EmptyState icon={Trophy} title="مفيش ماتشات مفتوحة دلوقتي" text="اعمل ماتش على ملعب معتمد، أو ارجع لنا كمان شوية وشوف الجديد." />}</div></>;
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
  if (!user) return <SignInGate title="فريقك يبدأ من هنا" text="سجّل دخولك عشان تكتشف لاعيبة، وتبعت طلبات صداقة، وتجهز ماتشك الجاي." />;
  const players = itemsOf(hasFilters ? searchQuery.data : suggestionsQuery.data);
  return <>
    <PageHeading eyebrow="غرفة الفريق" title="كوّن سكوادك قبل صافرة البداية" description="دور على لاعيبة على مستواك وابعتلهم طلبات صداقة، من غير شات بين اللاعبين." action={<div className="page-heading-actions"><button className="button-outline compact-button" onClick={() => setLocation("/support")}><MessageCircle size={16} /> المساعدة والدعم</button><button className="button-primary compact-button" onClick={() => setLocation("/play")}><Plus size={16} /> ماتش جديد</button></div>} />
    <section className="panel-card squad-intro"><div><span className="eyebrow">ملعبك يبدأ بفريقك</span><h2>لاعب مناسب، تمريرة أسرع، وماتش أحسن</h2><p>افتح ملف اللاعب وابعت طلب صداقة. لو محتاج تكلم الإدارة، دوس على «المساعدة والدعم».</p></div><div className="squad-intro-mark"><Users size={24} /><b>{players.length}</b><small>اقتراح متاح</small></div></section>
    <section className="panel-card squad-search-panel">
      <label className="players-search-input"><Search size={17} /><input value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="دور بالاسم أو المركز أو المستوى" aria-label="دور على لاعب تضيفه للسكواد" /></label>
      <label className="players-position-filter"><span>مركز اللعب</span><select value={position} onChange={event => setPosition(event.target.value)}><option value="">كل المراكز</option><option value="goalkeeper">حارس مرمى</option><option value="defender">مدافع</option><option value="midfielder">لاعب وسط</option><option value="forward">مهاجم</option></select></label><label className="players-position-filter"><span>مستوى اللعب</span><select value={skillLevel} onChange={event => setSkillLevel(event.target.value)}><option value="">كل المستويات</option><option value="مبتدئ">مبتدئ</option><option value="متوسط">متوسط</option><option value="متقدم">متقدم</option><option value="محترف">محترف</option></select></label>
      <small className="muted">اضغط على أي لاعب عشان تفتح ملفه وتبعت طلب صداقة. الشات بينك وبين الإدارة بس، من خلال المساعدة والدعم.</small>
    </section>
    <section className="players-directory-section"><div className="players-section-head"><h2>{hasFilters ? "نتايج البحث في السكواد" : "اقتراحات قريبة منك"}</h2><span>{players.length} لاعب</span></div>
      {suggestionsQuery.isLoading || searchQuery.isLoading ? <div className="panel-card players-empty"><LoaderCircle className="spin" /> جاري تحميل اللاعبين…</div> : (hasFilters ? searchQuery.isError : suggestionsQuery.isError) ? <div className="panel-card players-empty"><Users size={22} /><h3>مش قادرين نحمّل اللاعبين دلوقتي</h3><p>النت فصل؟ اتأكد إنك متصل بالإنترنت وجرب تاني.</p></div> : players.length ? <div className="players-grid">{players.map((player: Item) => <article className="panel-card player-card" key={player.id}><button className="player-card-main" onClick={() => setLocation(`/players/${player.id}`)}><span className="player-avatar">{mediaUrl(player.avatarUrl) ? <img src={mediaUrl(player.avatarUrl)} alt="" loading="lazy" onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = "/brzly-logo.svg"; }} /> : (player.name || "ب").charAt(0)}</span><span className="player-match-badge">{player.matchScore != null ? `${player.matchScore}% توافق` : "ممكن يناسبك"}</span><h3>{player.name || "لاعب"}</h3><p>{player.position || "المركز مش متحدد"}{player.skillLevel ? ` · ${player.skillLevel}` : ""}</p><small>{player.matchReason || player.bio || "لسه بيدوّر على فريق"}</small></button><button className="button-outline compact-button" onClick={() => setLocation(`/players/${player.id}`)}><Users size={14} /> افتح ملفه وضيفه</button></article>)}</div> : <div className="panel-card players-empty"><Users size={22} /><h3>{hasFilters ? "مفيش نتايج مطابقة" : "لسه مفيش اقتراحات"}</h3><p>{hasFilters ? "جرّب اسم أو مركز أو مستوى تاني." : "فعّل ظهور ملفك من الإعدادات، وهتشوف اللاعبين المتاحين عشان تكوّن فريق."}</p><button className="button-outline compact-button" onClick={() => setLocation("/settings")}>ظبّط ظهور ملفك <ArrowLeft size={14} /></button></div>}
    </section>
  </>;
}

function ChatPage({ user }: { user: User | null }) {
  const [location, setLocation] = useLocation();
  const [activeRoom, setActiveRoom] = useState<number | null>(null);
  const requestedRoom = Number(new URLSearchParams(window.location.search).get("room")) || null;
  const supportOnly = new URLSearchParams(window.location.search).get("support") === "1";
  const [message, setMessage] = useState("");
  const [replyingTo, setReplyingTo] = useState<Item | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
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
  const reactInFlightRef = useRef<Set<string>>(new Set());
  const sendInFlightRef = useRef(false);
  const utils = trpc.useUtils();
  useEffect(() => { if (!supportOnly) setLocation("/support"); }, [supportOnly, setLocation]);
  const roomsQuery = api.chat.rooms.useQuery(undefined, { enabled: Boolean(user && supportOnly), retry: false, staleTime: 0, refetchOnMount: "always", refetchInterval: 15_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true, refetchOnReconnect: true });
  const rooms = itemsOf(roomsQuery.data).filter(room => !supportOnly || room.roomType === "support");
  const selectedFromState = activeRoom && rooms.some(room => Number(room.id) === activeRoom) ? activeRoom : null;
  const requestedSupportRoom = rooms.some(room => Number(room.id) === requestedRoom) ? requestedRoom : null;
  const selected = selectedFromState ?? requestedSupportRoom ?? (Number(rooms[0]?.id || 0) || null);
  const selectedRoom = rooms.find(room => room.id === selected);
  const notificationMuteKey = `elbarzily:chat-muted:${user?.id ?? "guest"}:${selected ?? "none"}`;
  const peer = (selectedRoom?.participants || []).find((participant: Item) => participant.id !== user?.id);
  const messagesQuery = api.chat.messages.useQuery({ roomId: selected }, { enabled: Boolean(user && supportOnly && selected), retry: false, staleTime: 0, refetchOnMount: "always", refetchInterval: 5_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true, refetchOnReconnect: true });
  const lastLoadedMessageId = itemsOf(messagesQuery.data).reduce((latest, item) => Math.max(latest, Number(item.id) || 0), 0);
  const messageUpdatesQuery = api.chat.messageUpdates.useQuery(
    { roomId: selected || 1, afterId: lastLoadedMessageId },
    { enabled: Boolean(user && supportOnly && selected && messagesQuery.isSuccess), retry: false, staleTime: 0, refetchOnMount: "always", refetchInterval: 2_500, refetchIntervalInBackground: false, refetchOnWindowFocus: true, refetchOnReconnect: true },
  );
  useEffect(() => {
    if (!selected) return;
    const updates = itemsOf(messageUpdatesQuery.data);
    if (!updates.length) return;
    utils.chat.messages.setData({ roomId: selected }, current => {
      if (!current) return current;
      type MessageItem = (typeof current.items)[number];
      const byId = new Map<number, MessageItem>();
      for (const item of current.items) byId.set(Number(item.id), item);
      for (const item of updates) if (!byId.has(Number(item.id))) byId.set(Number(item.id), item as MessageItem);
      const items = Array.from(byId.values()).sort((a, b) => Number(a.id) - Number(b.id)).slice(-80);
      return { ...current, items: items as typeof current.items };
    });
  }, [messageUpdatesQuery.data, selected, utils]);
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
  const markReadMutation = api.chat.markRead.useMutation();
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
  const refreshChat = async () => { if (!selected) return; await Promise.all([messagesQuery.refetch(), roomsQuery.refetch()]); };
  const toggleNotificationsMuted = () => setNotificationsMuted(current => { const next = !current; try { window.localStorage.setItem(notificationMuteKey, String(next)); } catch { /* storage is optional */ } return next; });
  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const body = message.trim();
    if (!body || !selected || !user || sendInFlightRef.current) return;
    const roomId = selected;
    const optimisticId = -Date.now();
    const optimisticMessage = {
      id: optimisticId,
      roomId,
      senderId: user.id,
      body,
      messageType: "text",
      createdAt: new Date().toISOString(),
      senderName: user.name || "أنت",
      senderAvatarUrl: user.avatarUrl || null,
      senderAccountType: user.accountType || "player",
      senderRole: user.role || "player",
      reactions: [],
      quotedMessage: replyingTo ? { id: replyingTo.id, body: replyingTo.body, messageType: replyingTo.messageType, senderName: replyingTo.senderName || "رسالة مترد عليها" } : null,
      isPending: true,
    };
    sendInFlightRef.current = true;
    utils.chat.messages.setData({ roomId }, current => ({
      ...(current || { items: [] }),
      items: [...(current?.items || []), optimisticMessage] as NonNullable<typeof current>["items"],
    }));
    try {
      const result = await sendMutation.mutateAsync({ roomId, body, replyToMessageId: replyingTo?.id });
      const messageId = Number(result?.messageId);
      if (messageId) utils.chat.messages.setData({ roomId }, current => current ? ({
        ...current,
        items: current.items.map(item => Number(item.id) === optimisticId ? { ...item, id: messageId, isPending: false } : item),
      }) : current);
      setMessage(""); setReplyingTo(null);
      void refreshChat();
    }
    catch (error: any) {
      utils.chat.messages.setData({ roomId }, current => current ? ({ ...current, items: current.items.filter(item => Number(item.id) !== optimisticId) }) : current);
      toast.error(errorText(error, "ماقدرناش نبعت الرسالة، جرّب تاني."));
    }
    finally { sendInFlightRef.current = false; }
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
      toast.error("التسجيل الصوتي محتاج اتصال آمن HTTPS. افتح أحدث رابط للتطبيق وجرّب تاني.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("المتصفح ده مش بيدعم تسجيل الرسائل الصوتية.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const formats = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm", "audio/ogg"];
      const mimeType = formats.find(format => MediaRecorder.isTypeSupported(format));
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32_000 } : { audioBitsPerSecond: 32_000 });
      } catch {
        recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      }
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
        if (!blob.size) { toast.error("ما اتسجلش أي صوت."); return; }
        if (blob.size > 4 * 1024 * 1024) { toast.error("التسجيل أكبر من المسموح (4 ميجابايت). قصّر مدة التسجيل وجرّب تاني."); return; }
        const reader = new FileReader();
        reader.onerror = () => toast.error("ماقدرناش نجهز التسجيل الصوتي، جرّب تاني.");
        reader.onload = async () => {
          try {
            if (!selected) return;
            const dataBase64 = String(reader.result || "").split(",", 2)[1] || "";
            const extension = blob.type.includes("ogg") ? "ogg" : "webm";
            const uploaded = await uploadVoice.mutateAsync({ roomId: selected, fileName: `voice-${Date.now()}.${extension}`, mimeType: blob.type || "audio/webm", dataBase64, durationSeconds });
            await sendMutation.mutateAsync({ roomId: selected, messageType: "voice", mediaAssetId: uploaded.assetId, durationSeconds, replyToMessageId: replyingTo?.id });
            setReplyingTo(null);
            await refreshChat();
          } catch (error: any) { toast.error(errorText(error, "ماقدرناش نبعت التسجيل الصوتي، جرّب تاني.")); }
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
    try { await deleteMutation.mutateAsync({ messageId, scope }); await refreshChat(); toast.success(scope === "me" ? "الرسالة اتمسحت من عندك." : "الرسالة اتمسحت عند الكل."); }
    catch (error: any) { toast.error(errorText(error, "ماقدرناش نمسح الرسالة، جرّب تاني.")); }
  };
  const sendMedia = async (file?: File) => {
    if (!file || !selected) return;
    const messageType = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "file";
    const maxMb = messageType === "video" ? 30 : 10;
    if (file.size > maxMb * 1024 * 1024) { toast.error(`حجم الملف أكبر من المسموح (${maxMb} ميجابايت).`); return; }
    try { const dataBase64 = (await fileToDataUrl(file)).split(",", 2)[1] || ""; const uploaded = await uploadMedia.mutateAsync({ roomId: selected, fileName: file.name, mimeType: file.type || "application/octet-stream", dataBase64, messageType }); await sendMutation.mutateAsync({ roomId: selected, messageType, mediaAssetId: uploaded.assetId, replyToMessageId: replyingTo?.id }); setReplyingTo(null); await refreshChat(); }
    catch (error: any) { toast.error(errorText(error, "ماقدرناش نبعت الملف، جرّب تاني.")); }
  };
  const react = async (messageId: number, emoji: string) => {
    if (!selected || !user) return;
    const queryInput = { roomId: selected };
    const lockKey = `${selected}:${messageId}:${emoji}`;
    if (reactInFlightRef.current.has(lockKey)) return;
    reactInFlightRef.current.add(lockKey);
    const cached = utils.chat.messages.getData(queryInput);
    const target = cached?.items.find((item: Item) => Number(item.id) === Number(messageId));
    const wasActive = Boolean(target?.reactions?.some((reaction: Item) => Number(reaction.userId) === Number(user.id) && reaction.emoji === emoji));
    const setActive = (active: boolean) => utils.chat.messages.setData(queryInput, current => {
      if (!current) return current;
      return {
        ...current,
        items: current.items.map(item => {
          if (Number(item.id) !== Number(messageId)) return item;
          const reactions = item.reactions.filter(reaction => !(Number(reaction.userId) === Number(user.id) && reaction.emoji === emoji));
          if (active) reactions.push({ messageId, userId: Number(user.id), emoji });
          return { ...item, reactions };
        }),
      };
    });
    if (target) setActive(!wasActive);
    try {
      const result = await reactMutation.mutateAsync({ messageId, emoji });
      if (target && result.active !== !wasActive) setActive(result.active);
    } catch (error: any) {
      if (target) setActive(wasActive);
      toast.error(errorText(error, "ماقدرناش نضيف التفاعل، جرّب تاني."));
    } finally {
      reactInFlightRef.current.delete(lockKey);
    }
  };
  const toggleBlockPeer = async () => {
    if (!chatTargetId) return;
    const wasBlocked = Boolean(blockStatusQuery.data?.blocked);
    try {
      if (wasBlocked) await unblockMutation.mutateAsync({ userId: chatTargetId });
      else await blockMutation.mutateAsync({ userId: chatTargetId });
      await Promise.all([blockStatusQuery.refetch(), roomsQuery.refetch()]);
      toast.success(wasBlocked ? "الحظر اتلغى، وتقدر تتواصل تاني." : "المستخدم اتحظر.");
    } catch (error: any) { toast.error(errorText(error, wasBlocked ? "ماقدرناش نلغي الحظر، جرّب تاني." : "ماقدرناش نحظر المستخدم، جرّب تاني.")); }
  };
  const openSenderProfile = (sender: Item) => {
    if (sender.senderId === user?.id) { setLocation("/profile"); return; }
    // الحسابات القديمة قد لا تحتوي accountType رغم أن role يحدد أنها لاعب.
    if (sender.senderRole === "player" || sender.senderAccountType === "player") { setLocation(`/players/${sender.senderId}`); return; }
    toast.info("الحساب ده إداري أو صاحب ملعب، ومتابعة الملفات متاحة للاعبين بس.");
  };
  if (!user) return <SignInGate title="المساعدة والدعم" text="سجّل دخولك عشان تفتح شات خاص مع فريق الدعم." />;
  const supportRoom = selectedRoom?.roomType === "support";
  const supportName = "إدارة البرازيلي والدعم";
  const isAdminView = user.role === "admin" || user.role === "super_admin" || user.role === "moderator";
  const supportContact = supportRoom ? selectedRoom?.supportContact : null;
  const roomName = supportRoom ? (isAdminView ? supportContact?.name || supportName : supportName) : selectedRoom?.title || "شات الملعب";
  const peerStatus = peer?.isOnline ? "متصل الآن" : peer?.lastSeenAt ? `آخر ظهور ${new Date(peer.lastSeenAt).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}` : "شات البرازيلي";
  const openConversationProfile = () => {
    if (supportRoom) setProfileOpen(true);
    else if (peer?.id) openSenderProfile({ senderId: peer.id, senderAccountType: peer.accountType, senderRole: peer.role });
  };
  const jumpToMessage = (messageId: number) => {
    setProfileOpen(false);
    window.setTimeout(() => document.getElementById(`chat-message-${messageId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  };
  if (!supportOnly) return <div className="chat-empty-state"><LoadingLine label="جاري تحويلك للمساعدة والدعم…" /></div>;
  return (
    <div className="chat-page-shell">
      <div className="chat-page-heading"><PageHeading eyebrow="تواصل آمن" title="شات الدعم" description="ابعت لفريق الإدارة رسائل وصور وتسجيلات صوتية وفيديو وملفات." action={<button className="button-outline compact-button" onClick={() => setLocation("/support")}><LifeBuoy size={16} /> مركز المساعدة</button>} /></div>
      {rooms.length === 0 ? <div className="chat-empty-state"><EmptyState icon={MessageCircle} title="لسه مفيش شات دعم" text="افتح طلب من صفحة المساعدة والدعم، وهتلاقيه هنا." action={<button className="button-outline compact-button" onClick={() => setLocation("/support")}>افتح مركز المساعدة</button>} /></div> : (
        <div className="chat-layout">
          <aside className="chat-rooms" aria-label="قائمة الشاتات">
            {rooms.map(room => {
              const isSupport = room.roomType === "support";
              return <button key={room.id} className={`chat-room ${room.id === selected ? "active" : ""} ${room.pinned ? "support-pinned" : ""}`} onClick={() => setActiveRoom(room.id)}>
                <span className="room-avatar">{isSupport && isAdminView && mediaUrl(room.supportContact?.avatarUrl) ? <img src={mediaUrl(room.supportContact?.avatarUrl)} alt="" onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = "/brzly-logo.svg"; }} /> : isSupport ? <ShieldCheck size={18} /> : (room.title || room.name || "م").charAt(0)}</span>
                <span><b>{isSupport ? (isAdminView ? room.supportContact?.name || supportName : supportName) : room.title || room.name || "شات الملعب"}{room.pinned && <em className="chat-pinned-label">مثبت</em>}</b><small>{isSupport ? <>{isAdminView && room.supportContact?.isOnline ? <i className="chat-online-dot" /> : null}{isAdminView ? room.supportContact?.email || "شات عميل" : <><i className="chat-online-dot" /> متصل الآن</>}</> : room.lastMessage || "ابدأ الكلام"}</small></span>
                {room.unreadCount > 0 && <i>{room.unreadCount}</i>}
              </button>;
            })}
          </aside>
          <section className="chat-conversation" aria-label={`محادثة ${roomName}`}>
            <div className="chat-conversation-head">
              <button type="button" className="chat-header-avatar" onClick={openConversationProfile} aria-label={`فتح ملف ${roomName}`}>
                {supportRoom && isAdminView && mediaUrl(supportContact?.avatarUrl) ? <img src={mediaUrl(supportContact?.avatarUrl)} alt="" onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = "/brzly-logo.svg"; }} /> : supportRoom ? <img src="/brzly-logo.svg" alt="" /> : mediaUrl(peer?.avatarUrl) ? <img src={mediaUrl(peer?.avatarUrl)} alt="" onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = "/brzly-logo.svg"; }} /> : <span>{(roomName || "م").charAt(0)}</span>}
              </button>
              <button type="button" className="chat-header-info" onClick={openConversationProfile}>
                <span className="chat-title-line"><b>{roomName}</b>{supportRoom && <BadgeCheck size={18} aria-label="حساب موثّق" />}</span>
                <small>{supportRoom ? <>{isAdminView ? (supportContact?.isOnline ? <><i className="chat-online-dot" /> متصل الآن</> : supportContact?.lastSeenAt ? `آخر ظهور ${new Date(supportContact.lastSeenAt).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}` : "عميل الدعم") : <><i className="chat-online-dot" /> متصل دلوقتي · الشات مثبت</>}</> : peerStatus}</small>
              </button>
              {canBlockPeer && <button type="button" className={`chat-block-button${blockStatusQuery.data?.blocked ? " is-unblock" : ""}`} onClick={() => void toggleBlockPeer()} disabled={blockMutation.isPending || unblockMutation.isPending} title={blockStatusQuery.data?.blocked ? "إلغاء الحظر" : "حظر المستخدم"} aria-label={blockStatusQuery.data?.blocked ? "إلغاء الحظر" : "حظر المستخدم"}>{blockStatusQuery.data?.blocked ? <ShieldOff size={16} /> : <Shield size={16} />}<span className="chat-block-label">{blockStatusQuery.data?.blocked ? "إلغاء الحظر" : "حظر"}</span></button>}
              <button type="button" className="chat-header-action" onClick={openConversationProfile} aria-label="افتح الملف واختيارات الشات"><MoreHorizontal size={20} /></button>
            </div>

            <div ref={messagesContainerRef} className="chat-messages" aria-live="polite">
              {messagesQuery.isLoading ? <LoadingLine label="بنحمّل الرسائل…" /> : messages.map((item: Item, index: number) => {
                const mine = item.senderId === user.id;
                const groupedReactions = Object.entries((item.reactions || []).reduce((counts: Record<string, number>, reaction: Item) => { counts[reaction.emoji] = (counts[reaction.emoji] || 0) + 1; return counts; }, {}));
                const isRead = Boolean(item.isRead || item.readBy?.length > 0);
                const quotedText = item.quotedMessage?.messageType === "voice" ? "رسالة صوتية" : item.quotedMessage?.messageType === "text" ? item.quotedMessage.body : item.quotedMessage?.messageType === "image" ? "صورة" : item.quotedMessage?.messageType === "video" ? "فيديو" : "ملف";
                return <article id={`chat-message-${item.id}`} data-chat-message-id={item.id} key={item.id || index} className={`chat-bubble ${mine ? "mine" : ""}`}>
                  <button type="button" className="chat-sender" onClick={() => openSenderProfile(item)}><span className="chat-sender-avatar">{mediaUrl(item.senderAvatarUrl) ? <img src={mediaUrl(item.senderAvatarUrl)} alt="" onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = "/brzly-logo.svg"; }} /> : (item.senderName || (mine ? "أنت" : "ل")).charAt(0)}</span><b>{item.senderName || (mine ? "أنت" : supportRoom ? supportName : "لاعب")}</b>{isVerifiedAccount({ role: item.senderRole, accountType: item.senderAccountType }) && <BadgeCheck size={14} className="chat-sender-verified" aria-label="حساب موثّق" />}</button>
                  {item.quotedMessage && <button type="button" className="chat-quoted-message" onClick={() => jumpToMessage(item.quotedMessage.id)} aria-label={`روح لرسالة ${item.quotedMessage.senderName || "المقتبسة"}`}><b>{item.quotedMessage.senderName || "رسالة مترد عليها"}</b><span>{quotedText || "رسالة مترد عليها"}</span></button>}
                  {item.messageType === "voice" ? <VoiceNotePlayer messageId={item.id} durationSeconds={item.durationSeconds} /> : item.messageType === "text" ? <p>{item.body || item.content || item.message}</p> : <ChatMediaPreview messageId={item.id} messageType={item.messageType} fileName={item.fileName} />}
                  {groupedReactions.length > 0 && <div className="chat-reactions">{groupedReactions.map(([emoji, count]) => <button type="button" key={emoji} onClick={() => void react(item.id, emoji)}>{emoji} {String(count)}</button>)}</div>}
                  <div className="chat-message-meta"><small>{item.createdAt ? new Date(item.createdAt).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }) : ""}{item.isPending ? " · بتتبعت…" : isAdminView && mine && item.readBy?.length > 0 ? ` · اتقرت (${item.readBy.length})` : ""}</small>{mine && !item.isPending && <MessageReadReceipt read={isRead} />}</div>
                  {!item.isPending && <div className="chat-message-actions">
                    <button type="button" title="رد على الرسالة" onClick={() => { setReplyingTo(item); messageInputRef.current?.focus(); }}><MessageSquareText size={14} /> رد</button>
                    <button type="button" title="اختار تفاعل" onClick={() => setReactionTarget(reactionTarget === item.id ? null : item.id)} aria-expanded={reactionTarget === item.id}><Smile size={14} /> تفاعل</button>
                    <button type="button" title="امسح عندي" onClick={() => void deleteMessage(item.id, "me")} disabled={deleteMutation.isPending}><Trash2 size={13} /> امسح عندي</button>
                    {mine && <button type="button" title="امسح عند الكل" onClick={() => void deleteMessage(item.id, "everyone")} disabled={deleteMutation.isPending}><X size={13} /> امسح عند الكل</button>}
                  </div>}
                  {reactionTarget === item.id && <div className="chat-reaction-picker" aria-label="اختار تفاعل">{QUICK_REACTIONS.map(emoji => <button type="button" key={emoji} onClick={() => { void react(item.id, emoji); setReactionTarget(null); }} aria-label={`تفاعل ${emoji}`}>{emoji}</button>)}</div>}
                </article>;
              })}
              <div ref={bottomRef} />
            </div>

            <form className={`chat-compose${replyingTo ? " is-replying" : ""}${recording ? " is-recording" : ""}`} onSubmit={send}>
              {replyingTo && <div className="chat-reply-preview"><span><b>الرد على {replyingTo.senderName || "رسالة"}</b><small>{replyingTo.messageType === "voice" ? "رسالة صوتية" : replyingTo.messageType === "text" ? replyingTo.body : replyingTo.messageType === "image" ? "صورة" : replyingTo.messageType === "video" ? "فيديو" : "ملف"}</small></span><button type="button" aria-label="إلغاء الرد" onClick={() => setReplyingTo(null)}><X size={15} /></button></div>}
              <div className="chat-compose-row">
                <label className="chat-attach-button" title="ابعت صورة أو فيديو أو ملف" aria-label="ارفق صورة أو ملف"><Paperclip size={18} /><input type="file" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={event => { void sendMedia(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>
                <QuickEmojiPicker onSelect={insertEmoji} />
                <textarea ref={messageInputRef} value={message} rows={1} onChange={event => setMessage(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder={replyingTo ? `رد على ${replyingTo.senderName || "الرسالة"}...` : "اكتب رسالتك..."} aria-label="نص الرسالة" />
                {recording ? <button type="button" className="chat-compose-send chat-compose-mic is-recording" onClick={toggleRecording} aria-label="وقّف التسجيل الصوتي">{recordingSeconds}ث <X size={16} /></button>
                  : message.trim() ? <button type="submit" className="chat-compose-send" disabled={sendMutation.isPending} aria-label="ابعت الرسالة"><Send size={17} /></button>
                    : <button type="button" className="chat-compose-send chat-compose-mic" onClick={toggleRecording} disabled={uploadVoice.isPending || sendMutation.isPending} aria-label="سجّل رسالة صوتية"><Mic size={18} /></button>}
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
        onJumpToMessage={jumpToMessage}
        profile={isAdminView ? supportContact : undefined}
      />}
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
    if (!window.confirm("متأكد إنك عايز تلغي الحجز؟ مش هتقدر ترجع في الإلغاء بعد كده.")) return;
    try {
      await cancelMutation.mutateAsync({ id });
      await utils.bookings.mine.invalidate();
      toast.success("الحجز اتلغى، وبعتنالك تحديث على إيميلك لو متاح.");
    } catch (error: any) {
      toast.error(errorText(error, "ماقدرناش نلغي الحجز، جرّب تاني."));
    }
  };

  if (!user) return <SignInGate title="ملفك مستنيك" text="سجّل دخولك عشان تتابع حجوزاتك وطلبات الانضمام." />;
  const canCancelBookings = user.role === "player" || user.accountType === "player";
  return <><PageHeading eyebrow="حساب اللاعب" title="ملفي الشخصي" description="بياناتك وحجوزاتك وماتشاتك كلها في مكان واحد." action={<button className="button-outline compact-button" onClick={() => setLocation("/settings")}><Settings2 size={16} /> الإعدادات</button>} /><div className="profile-layout"><section className="profile-card"><div className="profile-cover" /><div className="profile-main"><div className="profile-avatar">{mediaUrl(user.avatarUrl) ? <img src={mediaUrl(user.avatarUrl)} alt="" onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = "/brzly-logo.svg"; }} /> : (user.name || "ب").charAt(0)}</div><div className="profile-copy"><h2>{user.name || "لاعب البرازيلي"} {isVerifiedAccount(user) && <BadgeCheck size={18} className="chat-sender-verified" aria-label="حساب موثّق" />}</h2><p><AtSignIcon />{user.email}</p><span className="role-pill"><span />{user.role === "owner" || user.accountType === "owner" ? (user.role === "owner" ? "صاحب ملعب" : "طلب تفعيل ملعب") : user.role === "super_admin" || user.role === "admin" ? "إدارة" : "لاعب"}</span></div><button className="button-ghost compact-button" onClick={() => setLocation("/settings")}>تعديل الملف <ArrowLeft size={15} /></button></div><div className="profile-stats"><div><b>{bookings.length}</b><small>طلبات الحجز</small></div><div><b>—</b><small>مباريات لعبتها</small></div><div><b>{user.region || "—"}</b><small>المنطقة</small></div></div></section><aside className="profile-shortcuts"><h3>إدارة حسابك</h3><button onClick={() => setLocation("/book")}><CalendarCheck2 size={17} /><span>حجوزاتي</span><ArrowLeft size={15} /></button>{(user.role === "owner" || user.accountType === "owner") && <button onClick={() => setLocation("/owner")}><Wallet size={17} /><span>لوحة الملعب</span><ArrowLeft size={15} /></button>}<button onClick={() => setLocation("/support")}><Headphones size={17} /><span>المساعدة والدعم</span><ArrowLeft size={15} /></button><button className="logout-shortcut" onClick={doLogout}><ArrowDownLeft size={17} /><span>تسجيل الخروج</span><ArrowLeft size={15} /></button></aside></div><div className="section-header booking-history-heading"><div><h2>آخر حجوزاتي</h2><p>تابع حالة طلباتك ورموز التأكيد</p></div><button className="text-link" onClick={() => setLocation("/book")}>احجز ملعب <span>←</span></button></div>{bookings.length ? <div className="history-list">{displayedBookings.map(item => <BookingRow key={item.id} booking={item} focused={Number(item.id) === focusedBookingId} canCancel={canCancelBookings} canceling={cancelMutation.isPending} onCancel={cancelBooking} />)}</div> : <EmptyState icon={CalendarDays} title="لسه شباكك نظيفة" text="يلا امسك ملعبك واحجز أول ماتش ليك." action={<button className="button-primary" onClick={() => setLocation("/book")}>دور على الملاعب <ArrowLeft size={16} /></button>} />}</>;
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
  const status = booking.status === "approved" ? "اتأكد" : booking.status === "rejected" ? "مرفوض" : booking.status === "cancelled" ? "ملغي" : "لسه بيتراجع";
  const startsAt = booking.startsAt ? new Date(booking.startsAt) : null;
  const mayCancel = canCancel && (booking.status === "pending" || booking.status === "approved") && startsAt && startsAt.getTime() > Date.now();
  const statusKind = booking.status === "approved" ? "success" : booking.status === "pending" ? "pending" : "danger";
  return <article id={`booking-${booking.id}`} className={`booking-row${focused ? " booking-row-focused" : ""}`}><div className={`booking-status-icon ${statusKind}`}>{booking.status === "approved" ? <Check size={17} /> : booking.status === "pending" ? <Clock3 size={17} /> : <X size={17} />}</div><div className="booking-row-main"><b>{booking.pitchName || booking.pitch?.name || "حجز ملعب"}</b><small>{startsAt ? startsAt.toLocaleDateString("ar-EG", { timeZone: "Africa/Cairo" }) : "ميعاد لسه مش متحدد"} · {startsAt ? startsAt.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Cairo" }) : ""} · حجز #{booking.id}</small></div><span className={`status-chip ${booking.status || "pending"}`}>{status}</span>{booking.status === "approved" && <button className="qr-open" onClick={() => setShowQr(v => !v)}>{showQr ? "اخفي QR" : "اعرض QR"}</button>}{mayCancel && <button className="booking-cancel-action" disabled={canceling} onClick={() => onCancel?.(Number(booking.id))}><X size={13} />{canceling ? "جاري الإلغاء" : booking.status === "pending" ? "الغي الطلب" : "الغي الحجز"}</button>}{showQr && qr && <img className="booking-qr" src={qr} alt="رمز تأكيد الحجز" />}</article>;
}


function OwnerBookingRow({ booking, onReview, reviewing }: { booking: Item; onReview: (booking: Item, status: "approved" | "rejected") => void; reviewing: boolean }) {
  const starts = booking.startsAt ? new Date(booking.startsAt) : null;
  const status = booking.status === "approved" ? "اتأكد" : booking.status === "rejected" ? "مرفوض" : "مستني قرارك";
  return <article className="owner-booking-row"><div className={`booking-status-icon ${booking.status === "approved" ? "success" : booking.status === "rejected" ? "danger" : "pending"}`}>{booking.status === "approved" ? <Check size={17} /> : booking.status === "rejected" ? <X size={17} /> : <Clock3 size={17} />}</div><div className="owner-booking-details"><div className="owner-booking-head"><b>{booking.playerName || `لاعب #${booking.playerId || "—"}`}</b><span className={`status-chip ${booking.status || "pending"}`}>{status}</span></div><small>{booking.playerPhone ? <a href={`tel:${booking.playerPhone.replace(/[^\d+]/g, "")}`}>{booking.playerPhone}</a> : "رقم التليفون مش متاح"}{booking.playerEmail ? ` · ${booking.playerEmail}` : ""}</small><small>{starts ? starts.toLocaleString("ar-EG") : "ميعاد لسه مش متحدد"} · {booking.fieldName || booking.field?.name || `ملعب فرعي #${booking.fieldId || "—"}`}</small><small>الدفع: {booking.paymentMethod === "arrival" ? "عند الوصول" : booking.paymentMethod === "full" ? "المبلغ كله" : "العربون"} · المبلغ: {booking.paymentAmount != null ? `${money(booking.paymentAmount)} ج.م` : "—"} · الكابتن: {booking.captainName || "من غير اختيار"}{booking.captainPhone ? ` (${booking.captainPhone})` : ""}</small>{booking.receiptUrl && <a className="booking-receipt-link" href={booking.receiptUrl} target="_blank" rel="noreferrer"><ImagePlus size={13} /> عرض إيصال الدفع</a>}</div>{booking.status === "pending" && <div className="owner-booking-actions"><button className="approve-button" disabled={reviewing} onClick={() => onReview(booking, "approved")}><Check size={15} /> قبول وإصدار QR</button><button className="reject-button" disabled={reviewing} onClick={() => onReview(booking, "rejected")}><X size={15} /> رفض</button></div>}</article>;
}

function OwnerPage({ user }: { user: User | null }) {
  const [location, setLocation] = useLocation();
  const [ownerSection, setOwnerSection] = useState("summary");
  const [subscriptionNow, setSubscriptionNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setSubscriptionNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const isOwnerAccount = user?.accountType === "owner" || user?.role === "owner";
  const subscriptionConfig = api.subscriptions.plans.useQuery(undefined, { enabled: Boolean(isOwnerAccount), retry: false, staleTime: 0, refetchOnMount: "always" });
  const subscriptionRequired = (subscriptionConfig.data as any)?.subscriptionRequired !== false;
  const isActiveOwner = user?.role === "owner" || (isOwnerAccount && !subscriptionRequired);
  const utils = trpc.useUtils();
  const dashboard = api.owner.dashboard.useQuery(undefined, { enabled: Boolean(isActiveOwner), retry: false, staleTime: 0, refetchOnMount: "always", refetchInterval: 15_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true, refetchOnReconnect: true });
  const bookingStatusSync = api.owner.bookingStatusSync.useQuery(undefined, { enabled: Boolean(isActiveOwner), retry: false, staleTime: 0, refetchOnMount: "always", refetchInterval: 10_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true, refetchOnReconnect: true });
  const savePitch = api.owner.savePitch.useMutation();
  const uploadPitchImage = api.uploads.image.useMutation();
  const updateBookingSettings = api.owner.updateBookingSettings.useMutation();
  const saveCaptains = api.owner.saveCaptains.useMutation();
  const publish = api.owner.publishSchedule.useMutation();
  const reviewBooking = api.bookings.review.useMutation();
  const [pitchName, setPitchName] = useState(""); const [address, setAddress] = useState(""); const [city, setCity] = useState(""); const [mapUrl, setMapUrl] = useState("");
  const [captainName, setCaptainName] = useState(""); const [captainPhone, setCaptainPhone] = useState("");
  const [morningPrice, setMorningPrice] = useState(""); const [eveningPrice, setEveningPrice] = useState("");
  const [slotStart, setSlotStart] = useState("18:00"); const [slotEnd, setSlotEnd] = useState("19:00"); const [slotDate, setSlotDate] = useState(dateKey(new Date())); const [selectedFieldId, setSelectedFieldId] = useState(""); const [subPitchCount, setSubPitchCount] = useState("1"); const [posterUrl, setPosterUrl] = useState("");
  const [vodafoneCashNumber, setVodafoneCashNumber] = useState(""); const [bookingPaymentMode, setBookingPaymentMode] = useState<"arrival" | "deposit">("arrival"); const [depositAmount, setDepositAmount] = useState("");
  const [captainRows, setCaptainRows] = useState<Array<{ id?: number; name: string; phone: string }>>([]); const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [reviewedBookingStatuses, setReviewedBookingStatuses] = useState<Record<number, "approved" | "rejected">>({});
  const data = dashboard.data as any;
  const subscriptionState = getOwnerSubscriptionState(user?.ownerSubscriptionExpiresAt, subscriptionNow);
  const serverSaysSubscriptionExpired = String((dashboard.error as any)?.message || "").includes("انتهت مدة اشتراك");
  const activeFields = itemsOf(data?.fields).filter((field: Item) => Boolean(field.isActive));
  useEffect(() => {
    if (data?.pitch) {
      const pitch = data.pitch;
      setPitchName(pitch.name || "");
      setAddress(pitch.address || "");
      setCity(pitch.city || "");
      setMapUrl(pitch.mapUrl || "");
      setCaptainName(pitch.captainName || "");
      setCaptainPhone(pitch.captainPhone || "");
      setMorningPrice(String(pitch.morningPrice || ""));
      setEveningPrice(String(pitch.eveningPrice || ""));
      setSubPitchCount(String(pitch.subPitchCount || 1));
      setPosterUrl(pitch.imageUrl && !pitch.imageUrl.includes("/manus-storage/") ? pitch.imageUrl : defaultPitchImageForId(pitch.id));
      setVodafoneCashNumber(pitch.vodafoneCashNumber || "");
      setBookingPaymentMode(pitch.bookingPaymentMode === "deposit" ? "deposit" : "arrival");
      setDepositAmount(String(pitch.depositAmount || ""));
    }
    if (Array.isArray(data?.captains)) setCaptainRows(data.captains.map((captain: Item) => ({ id: captain.id, name: captain.name || "", phone: captain.phone || "" })));
  }, [data?.pitch, data?.captains]);
  useEffect(() => {
    if (selectedFieldId && !activeFields.some((field: Item) => String(field.id) === selectedFieldId)) setSelectedFieldId("");
  }, [data?.fields, selectedFieldId]);
  if (!user) return <SignInGate title="لوحة الكابتن" text="سجّل دخولك بحساب صاحب ملعب عشان تدير ملعبك." />;
  if (!isOwnerAccount) return <EmptyState icon={Shield} title="الصفحة دي لأصحاب الملاعب" text="اعمل حساب صاحب ملعب أو سجّل دخولك بحسابك." action={<button className="button-outline" onClick={() => setLocation("/join")}>اعمل حساب صاحب ملعب</button>} />;
  if (!isActiveOwner && subscriptionRequired) return <><PageHeading eyebrow="طلب تفعيل الملعب" title="اختار باقة الاشتراك" description="بعد ما تبعت الإيصال، الإدارة هتراجع الدفع خلال 24 ساعة. صفحة الملعب مش هتتنشر غير بعد الموافقة." /><div className="notice-banner"><ShieldCheck size={18} /><div><b>حسابك مستني تفعيل الإدارة</b><span>اختار باقة، حوّل المبلغ، وبعدها ارفع صورة الإيصال واكتب رقم العملية.</span></div></div><OwnerSubscription user={user} />;</>
  if (subscriptionRequired && (subscriptionState.status !== "active" || serverSaysSubscriptionExpired)) return <><PageHeading eyebrow="اشتراك الملعب" title="اشتراكك خلص يا كابتن" description="لوحة الملعب وإدارة المواعيد مقفولين لحد ما تجدّد الاشتراك." /><div className="notice-banner"><ShieldCheck size={18} /><div><b>{subscriptionState.status === "missing" ? "اشتراكك مش متسجل" : "لوحة الملعب مقفولة دلوقتي"}</b><span>بيانات ملعبك وحجوزاتك محفوظة. اختار باقة جديدة وابعت طلب التجديد عشان تفتح اللوحة تاني.</span></div></div><OwnerSubscription user={user} /></>;
  if (dashboard.isError) return <><PageHeading eyebrow="لوحة الملعب" title="مش قادرين نفتحها دلوقتي" description="اتأكد من النت وجرّب تاني بعد شوية." action={<button className="button-outline compact-button" onClick={() => void dashboard.refetch()}>جرّب تاني</button>} /><div className="notice-banner"><ShieldCheck size={18} /><div><b>بياناتك محفوظة يا كابتن</b><span>لو المشكلة فضلت، كلّم الدعم من مركز المساعدة.</span></div></div></>;
  const save = async (event: React.FormEvent) => { event.preventDefault(); try { const result = await savePitch.mutateAsync({ id: data?.pitch?.id, name: pitchName, address, city, mapUrl, captainName, captainPhone, morningPrice: Number(morningPrice), eveningPrice: Number(eveningPrice), subPitchCount: Number(subPitchCount), imageUrl: posterUrl || undefined }) as any; await dashboard.refetch(); if (result?.emailSent && result?.inAppNotified) toast.success("بيانات الملعب اتحفظت، وبعتنا تفاصيلها للإدارة على البريد وفي تنبيه."); else if (result?.emailSent) toast.success("بيانات الملعب اتحفظت، وبعتنا التفاصيل على بريد الإدارة."); else if (result?.inAppNotified) toast.success("البيانات اتحفظت، والإدارة وصلها تنبيه في التطبيق، بس الإيميل ما اتبعتش."); else toast.error("البيانات اتحفظت، بس التنبيه ماوصلش للإدارة. راجع لوحة المراجعة أو كلم الدعم."); } catch (error: any) { toast.error(errorText(error, "مش قادرين نحفظ بيانات الملعب.")); } };
  const uploadPitchPoster = async (file?: File) => { if (!file) return; if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 8 * 1024 * 1024) { toast.error("ارفع صورة JPG أو PNG أو WebP، بحد أقصى 8 ميجابايت."); return; } try { const dataBase64 = (await fileToDataUrl(file)).split(",", 2)[1] || ""; const uploaded = await uploadPitchImage.mutateAsync({ fileName: file.name, mimeType: file.type, dataBase64 }); setPosterUrl(String((uploaded as any).url || "")); toast.success("صورة الملعب اترفعت."); } catch (error: any) { toast.error(errorText(error, "مش قادرين نرفع صورة الملعب.")); } };
  const savePaymentSettings = async (event: React.FormEvent) => { event.preventDefault(); const pitchId = data?.pitch?.id; if (!pitchId) return; const nextCashNumber = vodafoneCashNumber.trim(); const nextDepositAmount = Number(depositAmount || 0); if (bookingPaymentMode === "deposit" && nextDepositAmount <= 0) { toast.error("اكتب مبلغ العربون الأول."); return; } try { await updateBookingSettings.mutateAsync({ pitchId, vodafoneCashNumber: nextCashNumber, bookingPaymentMode, depositAmount: nextDepositAmount }); utils.owner.dashboard.setData(undefined, current => current?.pitch ? { ...current, pitch: { ...current.pitch, vodafoneCashNumber: nextCashNumber, bookingPaymentMode, depositAmount: String(nextDepositAmount) } } : current); await Promise.all([dashboard.refetch(), utils.pitches.list.invalidate()]); toast.success("إعدادات الحجز والدفع اتحفظت يا كابتن."); } catch (error: any) { toast.error(errorText(error, "مش قادرين نحفظ إعدادات الدفع.")); } };
  const saveCaptainList = async () => { const pitchId = data?.pitch?.id; if (!pitchId) return; const captains = captainRows.map(captain => ({ name: captain.name.trim(), phone: captain.phone.trim() })).filter(captain => captain.name && captain.phone); try { await saveCaptains.mutateAsync({ pitchId, captains }); await dashboard.refetch(); toast.success("قائمة الكباتن اتحفظت يا كابتن."); } catch (error: any) { toast.error(errorText(error, "مش قادرين نحفظ قائمة الكباتن.")); } };
  const getFieldId = () => activeFields.find((field: Item) => String(field.id) === selectedFieldId)?.id;
  const addSlot = async () => { const pitchId = data?.pitch?.id; const fieldId = getFieldId(); if (!pitchId || !fieldId) { toast.error(activeFields.length ? "اختار رقم الملعب الفرعي الأول." : "احفظ بيانات الملعب الأول."); return; } try { await publish.mutateAsync({ pitchId, fieldId, items: [{ startsAt: cairoDateTimeToIso(slotDate, slotStart), endsAt: cairoDateTimeToIso(slotDate, slotEnd), price: eveningPrice || morningPrice || "0" }] }); await dashboard.refetch(); toast.success("الميعاد اتنشر، واللاعبين يقدروا يحجزوه دلوقتي."); } catch (error: any) { toast.error(errorText(error, "مش قادرين ننشر الميعاد.")); } };
  const contactSupport = async () => { setLocation("/support"); };
  const review = async (booking: Item, status: "approved" | "rejected") => { let note: string | undefined; if (status === "rejected") { note = window.prompt("اكتب سبب الرفض لو حابب")?.trim() || undefined; } const bookingId = Number(booking.id); setReviewingId(bookingId); try { await Promise.all([utils.owner.dashboard.cancel(), utils.owner.bookingStatusSync.cancel()]); await reviewBooking.mutateAsync({ id: booking.id, status, ...(note ? { note } : {}) }); setReviewedBookingStatuses(current => ({ ...current, [bookingId]: status })); utils.owner.bookingStatusSync.setData(undefined, current => current ? { ...current, items: current.items.map(item => Number(item.id) === bookingId ? { ...item, status, reviewedAt: new Date() } : item) } : current); utils.owner.dashboard.setData(undefined, current => current ? { ...current, bookings: current.bookings.map(item => Number(item.id) === bookingId ? { ...item, status, reviewedAt: new Date() } : item) } : current); void Promise.all([dashboard.refetch(), bookingStatusSync.refetch()]).catch(() => undefined); toast.success(status === "approved" ? "الحجز اتقبل وQR بقى جاهز للاعب." : "تم رفض الحجز وإبلاغ اللاعب."); } catch (error: any) { toast.error(errorText(error, "ماقدرناش نحدّث الحجز، جرّب تاني.")); } finally { setReviewingId(null); } };
  const syncedBookingStatuses = new Map<number, Item>();
  for (const item of itemsOf(bookingStatusSync.data)) syncedBookingStatuses.set(Number(item.id), item as Item);
  const bookings: Item[] = itemsOf(data?.bookings).map((booking: Item): Item => {
    const liveStatus = syncedBookingStatuses.get(Number(booking.id));
    const locallyReviewedStatus = reviewedBookingStatuses[Number(booking.id)];
    return { ...booking, ...(liveStatus || {}), ...(locallyReviewedStatus ? { status: locallyReviewedStatus } : {}) } as Item;
  }); const slots = itemsOf(data?.slots); const wallet = data?.wallet || {};
  return <><PageHeading eyebrow="إدارة ملعبك" title="لوحة الكابتن" description="كل اللي محتاجه عشان تدير المواعيد والحجوزات والأرباح." action={<><span className="status-chip approved subscription-countdown">{subscriptionState.daysRemaining > 1 ? `فاضل ${subscriptionState.daysRemaining} يوم على التجديد` : `فاضل ${subscriptionState.hoursRemaining} ساعة على التجديد`}</span><span className={`status-chip ${data?.pitch?.status === "published" ? "approved" : "pending"}`}>{data?.pitch?.status === "published" ? "الملعب منشور" : "الإدارة بتراجع صفحة الملعب"}</span><button className="button-outline compact-button" onClick={contactSupport}><Headphones size={15} /> دعم الإدارة</button></>} />
    {data?.pitch?.status !== "published" && <div className="notice-banner"><ShieldCheck size={18} /><div><b>صفحة الملعب لسه ما اتنشرتش</b><span>لازم الإدارة توافق على بيانات الملعب قبل ما تظهر للاعبين.</span></div></div>}
    <nav className="owner-section-nav" aria-label="أقسام إدارة الملعب">{[{ id: "summary", label: "الملخص" }, { id: "setup", label: "الملعب والمواعيد" }, { id: "captains", label: "الكباتن" }, { id: "bookings", label: "الحجوزات وQR" }, { id: "subscription", label: "الاشتراك" }].map(item => <button type="button" key={item.id} className={ownerSection === item.id ? "active" : ""} onClick={() => setOwnerSection(item.id)}>{item.label}</button>)}</nav>
    <div className={`owner-stats owner-mobile-section ${ownerSection === "summary" ? "is-active" : ""}`}><Metric label="حجوزات مستنية قرارك" value={bookings.filter(item => item.status === "pending").length} icon={Clock3} tone="lime" /><Metric label="مواعيد منشورة" value={slots.length} icon={CalendarDays} tone="blue" /><Metric label="إجمالي اللي اتقبض" value={`${money(wallet.total || 0)} ج.م`} icon={Wallet} tone="gold" /><Metric label="عمولة المنصة" value={`${money(wallet.commission || 0)} ج.م`} icon={CircleDollarSign} tone="purple" /></div>
    <div className={`owner-grid owner-mobile-section ${ownerSection === "setup" ? "is-active" : ""}`}><section className="panel-card owner-profile-panel"><div className="panel-title"><div><span className="eyebrow">ملف الملعب</span><h2>بيانات الملعب والتسعير</h2></div><Settings2 size={19} /></div><form className="owner-form" onSubmit={save}><label className="form-field"><span>اسم الملعب</span><input value={pitchName} onChange={event => setPitchName(event.target.value)} placeholder="مثال: ملعب الفرسان" required /></label><div className="two-fields"><label className="form-field"><span>عدد الملاعب الفرعية</span><input type="number" min="1" max="20" value={subPitchCount} onChange={event => setSubPitchCount(event.target.value)} /></label><label className="form-field"><span>العنوان / المنطقة</span><input value={address} onChange={event => setAddress(event.target.value)} placeholder="الحي والشارع" required /></label></div><label className="form-field"><span>المدينة أو المحافظة</span><input value={city} onChange={event => setCity(event.target.value)} placeholder="القاهرة" required /></label><label className="form-field"><span>رابط موقع Google Maps</span><input value={mapUrl} onChange={event => setMapUrl(event.target.value)} placeholder="https://maps.google.com/..." /></label><div className="two-fields"><label className="form-field"><span>اسم الكابتن الرئيسي</span><input value={captainName} onChange={event => setCaptainName(event.target.value)} placeholder="اسم المسؤول" /></label><label className="form-field"><span>رقم الكابتن الرئيسي</span><input value={captainPhone} onChange={event => setCaptainPhone(event.target.value)} placeholder="01X XXXX XXXX" /></label></div><div className="two-fields"><label className="form-field"><span>سعر الساعة صباحاً (ج.م)</span><input type="number" min="0" value={morningPrice} onChange={event => setMorningPrice(event.target.value)} placeholder="500" /></label><label className="form-field"><span>سعر الساعة مساءً (ج.م)</span><input type="number" min="0" value={eveningPrice} onChange={event => setEveningPrice(event.target.value)} placeholder="700" /></label></div><label className="form-field"><span>صورة الملعب</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => void uploadPitchPoster(event.target.files?.[0])} /><small>{uploadPitchImage.isPending ? "جاري رفع الصورة…" : posterUrl ? "اخترت صورة" : "لو ما رفعتش صورة، النظام هيختار صورة مناسبة تلقائيًا."}</small></label>{posterUrl && <img className="owner-pitch-preview" src={posterUrl} alt="معاينة صورة الملعب" />}<button className="button-primary" disabled={savePitch.isPending || uploadPitchImage.isPending}>{savePitch.isPending ? <LoaderCircle size={17} className="spin" /> : <><Check size={17} /> حفظ بيانات الملعب</>}</button></form>
      <form className="owner-form booking-settings-form" onSubmit={savePaymentSettings}><div className="panel-title nested-title"><div><span className="eyebrow">إعدادات الحجز</span><h2>طريقة الدفع للاعبين</h2></div><Banknote size={18} /></div><label className="form-field"><span>رقم Vodafone Cash</span><input inputMode="tel" value={vodafoneCashNumber} onChange={event => setVodafoneCashNumber(event.target.value)} placeholder="01X XXXX XXXX" /></label><div className="payment-mode-options"><label><input type="radio" checked={bookingPaymentMode === "arrival"} onChange={() => setBookingPaymentMode("arrival")} /> الدفع عند الوصول</label><label><input type="radio" checked={bookingPaymentMode === "deposit"} onChange={() => setBookingPaymentMode("deposit")} /> دفع العربون مسبقاً</label></div>{bookingPaymentMode === "deposit" && <label className="form-field"><span>مبلغ العربون (ج.م)</span><input type="number" min="1" value={depositAmount} onChange={event => setDepositAmount(event.target.value)} placeholder="200" required /></label>}<p className="panel-intro">الإعدادات دي بتتحفظ لوحدها ومش بترجع الملعب للمراجعة.</p><button className="button-outline" disabled={updateBookingSettings.isPending}><Check size={16} /> حفظ إعدادات الحجز</button></form>
    </section>
    <section className="panel-card schedule-panel"><div className="panel-title"><div><span className="eyebrow">المواعيد المتاحة</span><h2>انشر مواعيد اللعب</h2></div><CalendarCheck2 size={19} /></div><p className="panel-intro">انشر ميعاد، أو استخدم المساعد عشان يعملك جدول فعلي للتاريخ ده.</p><label className="form-field"><span>يوم اللعب</span><input type="date" value={slotDate} min={dateKey(new Date())} onChange={event => setSlotDate(event.target.value)} /></label><label className="form-field"><span>رقم الملعب</span><select value={selectedFieldId} onChange={event => setSelectedFieldId(event.target.value)} disabled={!activeFields.length} required={activeFields.length > 0}><option value="" disabled>اختار الملعب الفرعي</option>{activeFields.map((field: Item, index: number) => <option key={field.id} value={String(field.id)}>{field.name || `ملعب ${index + 1}`}</option>)}</select></label><div className="two-fields"><label className="form-field"><span>من</span><input type="time" value={slotStart} onChange={event => setSlotStart(event.target.value)} /></label><label className="form-field"><span>إلى</span><input type="time" value={slotEnd} onChange={event => setSlotEnd(event.target.value)} /></label></div><button className="button-primary full-button" onClick={addSlot} disabled={publish.isPending}>{publish.isPending ? <LoaderCircle size={17} className="spin" /> : <><Zap size={16} /> انشر الميعاد دلوقتي</>}</button></section></div>
    <section className={`panel-card captain-management owner-mobile-section ${ownerSection === "captains" ? "is-active" : ""}`}><div className="panel-title"><div><span className="eyebrow">فريق الملعب</span><h2>إدارة الكباتن</h2></div><Users size={19} /></div><p className="panel-intro">ضيف الاسم ورقم التليفون عشان اللاعب يشوف الكابتن وقت الحجز.</p><div className="captain-list">{captainRows.map((captain, index) => <div className="captain-editor-row" key={captain.id || index}><input value={captain.name} onChange={event => setCaptainRows(rows => rows.map((row, rowIndex) => rowIndex === index ? { ...row, name: event.target.value } : row))} placeholder="اسم الكابتن" /><input inputMode="tel" value={captain.phone} onChange={event => setCaptainRows(rows => rows.map((row, rowIndex) => rowIndex === index ? { ...row, phone: event.target.value } : row))} placeholder="01X XXXX XXXX" /><button type="button" className="icon-button" aria-label="امسح الكابتن" onClick={() => setCaptainRows(rows => rows.filter((_, rowIndex) => rowIndex !== index))}><X size={16} /></button></div>)}</div><div className="captain-actions"><button className="button-outline" type="button" onClick={() => setCaptainRows(rows => [...rows, { name: "", phone: "" }])}><Plus size={16} /> ضيف كابتن</button><button className="button-primary" type="button" onClick={saveCaptainList} disabled={saveCaptains.isPending}><Check size={16} /> احفظ القائمة</button></div></section>
    <section className={`panel-card owner-bookings owner-mobile-section ${ownerSection === "bookings" ? "is-active" : ""}`}><div className="panel-title"><div><span className="eyebrow">قرار صاحب الملعب</span><h2>آخر الحجوزات</h2></div><a className="text-link" href="#qr">امسح QR <ArrowLeft size={14} /></a></div>{bookings.length ? <div className="history-list">{bookings.slice(0, 8).map(item => <OwnerBookingRow key={item.id} booking={item} onReview={review} reviewing={reviewingId === Number(item.id)} />)}</div> : <EmptyState icon={CalendarDays} title="لسه مفيش حجوزات" text="طلبات اللاعبين هتظهر هنا بعد ما تنشر المواعيد." />}</section><div className={`owner-mobile-section ${ownerSection === "bookings" ? "is-active" : ""}`}><LazyPage><QrCheckSection /></LazyPage></div><div className={`owner-mobile-section ${ownerSection === "subscription" ? "is-active" : ""}`}><OwnerSubscription user={user} /></div>
  </>;
}

function OwnerSubscription({ user }: { user: User }) {
  const plansQuery = api.subscriptions.plans.useQuery(undefined, { enabled: user.role === "owner" || user.accountType === "owner", retry: false });
  const plans = itemsOf(plansQuery.data);
  const imageByPlanId = useMemo(() => assignUniquePlanImages(plans as Array<{ id: number | string; imageUrl?: string | null }>), [plans]);
  const request = api.subscriptions.request.useMutation(); const upload = api.uploads.image.useMutation();
  const [planId, setPlanId] = useState<number | null>(null); const [receiptUrl, setReceiptUrl] = useState(""); const [paymentReference, setPaymentReference] = useState(""); const receiptInputRef = useRef<HTMLInputElement>(null);
  const cashNumber = (plansQuery.data as any)?.vodafoneCashNumber || "";
  const subscriptionRequired = (plansQuery.data as any)?.subscriptionRequired !== false;
  if (!subscriptionRequired) return <section className="panel-card subscription-area subscription-disabled" id="subscription"><div className="panel-title"><div><span className="eyebrow">اشتراكات أصحاب الملاعب</span><h2>الدفع متوقف حاليًا</h2></div><Crown size={20} /></div><div className="notice-banner"><ShieldCheck size={18} /><div><b>سجّل ملعبك وابدأ من غير دفع</b><span>الإدارة موقفة تحصيل الاشتراكات مؤقتًا. مش محتاج ترفع صورة أو تدفع كاش؛ كمّل بيانات ملعبك وخلاص.</span></div></div></section>;
  const submit = async () => { if (!planId || !receiptUrl || !paymentReference.trim() || !cashNumber) { toast.error("اختار باقة، واكتب رقم العملية، واتأكد إن رقم الدفع جاهز وإنك رفعت الإيصال."); return; } try { const result = await request.mutateAsync({ planId, vodafoneCashNumber: cashNumber, paymentReference: paymentReference.trim(), receiptUrl }); toast.success(result.status === "approved" ? "الإيصال اتطابق وحسابك اتفعّل فورًا." : result.status === "rejected" ? "الإيصال اترفض تلقائيًا عشان بيانات الدفع مش مطابقة." : "الإيصال وصل، والإدارة هتراجعه وتبعتلك خبر."); } catch (error: any) { toast.error(errorText(error, "ماقدرناش نبعت طلب الاشتراك، جرّب تاني.")); } };
  const handleReceipt = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 12 * 1024 * 1024) { toast.error("اختار صورة واضحة، حجمها مايزيدش عن 12 ميجابايت."); return; }
    try {
      const dataUrl = await fileToDataUrl(file);
      const image = await new Promise<HTMLImageElement>((resolve, reject) => { const element = new Image(); element.onload = () => resolve(element); element.onerror = () => reject(new Error("مش قادرين نقرأ صورة التحويل")); element.src = dataUrl; });
      const scale = Math.min(1, 1600 / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
      const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale)); canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
      canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
      const compressed = canvas.toDataURL("image/jpeg", 0.82);
      const dataBase64 = compressed.split(",")[1] || "";
      const result = await upload.mutateAsync({ fileName: `${file.name.replace(/\.[^.]+$/, "") || "receipt"}.jpg`, mimeType: "image/jpeg", dataBase64 });
      setReceiptUrl((result as any).url); toast.success("الإيصال اترفع.");
    } catch (error: any) { toast.error(errorText(error, "مش قادرين نرفع الإيصال. جرّب صورة JPG أو PNG أصغر.")); }
  };
  return <section className="panel-card subscription-area" id="subscription"><div className="panel-title"><div><span className="eyebrow">اشتراك الملعب</span><h2>اختار الباقة اللي تناسبك</h2></div><Crown size={20} /></div><div className="plan-grid">{plans.length ? plans.map(plan => <button key={plan.id} className={`plan-card ${planId === plan.id ? "selected" : ""}`} onClick={() => setPlanId(plan.id)}>{imageByPlanId.get(Number(plan.id)) && <img className="plan-card-image" src={imageByPlanId.get(Number(plan.id))} alt="" loading="lazy" decoding="async" />}<span className="plan-name">{plan.name || "باقة الملعب"}</span><b>{money(plan.price)} <small>ج.م</small></b><span>{plan.durationDays || 30} يوم</span><p>{plan.description || "ظهور أكتر للاعبين وإدارة مواعيدك."}</p>{planId === plan.id && <Check className="plan-check" size={17} />}</button>) : <p className="muted">ستظهر الباقات بعد إضافتها من لوحة الإدارة.</p>}</div><div className="subscription-payment"><div><b>الدفع عبر Vodafone Cash</b><span>حوّل قيمة الاشتراك إلى الرقم التالي ثم أرفق الإيصال.</span><strong className="cash-number">{cashNumber || "الإدارة لسه ما ضافتش رقم الدفع"}</strong></div><label className="form-field"><span>رقم التحويل / مرجعه</span><input value={paymentReference} onChange={event => setPaymentReference(event.target.value)} placeholder="اكتب رقم العملية" /></label><div className="receipt-drop small-upload"><ImagePlus size={18} /><span><b>{receiptUrl ? "الإيصال اترفق" : "ارفق الإيصال"}</b><small>{receiptUrl ? "اضغط عشان تختار إيصال تاني" : "اضغط هنا عشان تختار صورة التحويل"}</small></span><button type="button" className="receipt-select-button" onClick={() => receiptInputRef.current?.click()}>{receiptUrl ? "غيّر الصورة" : "اختار صورة"}</button><input className="receipt-file-input" ref={receiptInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { void handleReceipt(event.target.files?.[0]); event.currentTarget.value = ""; }} /></div><button className="button-primary" onClick={submit} disabled={request.isPending}>{request.isPending ? <LoaderCircle size={17} className="spin" /> : <>اشترك دلوقتي <ArrowLeft size={15} /></>}</button></div><p className="review-note"><Clock3 size={14} /> الإدارة هتراجع الدفع خلال 24 ساعة، وحسابك هيتفعّل بعد ما تتأكد من صحة البيانات.</p></section>;
}

function SupportPage({ user }: { user: User | null }) {
  const [, setLocation] = useLocation();
  const openSupport = api.chat.openSupport.useMutation();
  const manageSupport = async () => {
    if (!user) return;
    try {
      const room = await openSupport.mutateAsync();
      const roomId = (room as any)?.id;
      if (roomId == null) throw new Error("مش قادرين نلاقي غرفة الدعم، جرّب تاني.");
      setLocation(`/chat?room=${encodeURIComponent(String(roomId))}&support=1`);
    } catch (error: any) {
      toast.error(errorText(error, "مش قادرين نفتح غرفة الدعم. جرّب تاني."));
    }
  };
  const faq = [
    { title: "الحساب والتسجيل", icon: LogIn, items: [
      ["أسجّل دخول إزاي؟", "اكتب إيميلك وكلمة السر. نسيت كلمة السر؟ دوس على «نسيت كلمة المرور؟» وامشي مع الخطوات."],
      ["رمز التفعيل موصلش، أعمل إيه؟", "اتأكد إن الإيميل مكتوب صح، واستنى دقيقة قبل ما تطلب الرمز تاني. وخلي بالك، ماتديش رمز التفعيل لأي حد."],
    ] },
    { title: "الحجز والدفع", icon: CalendarDays, items: [
      ["أحجز ملعب إزاي؟", "اختار الملعب واليوم، ودوس على ميعاد متاح، وبعدها كمّل طلب الحجز. تابع حالته من حسابك."],
      ["أدفع إزاي؟", "طريقة الدفع بتختلف من ملعب للتاني. راجع تفاصيل الحجز كويس واحتفظ بالإيصال لو مطلوب."],
    ] },
    { title: "الصور والملفات", icon: Camera, items: [
      ["أرفع صورة بإيه؟", "ارفع JPG أو PNG أو WebP، وخلي صورة حسابك أقل من 5 ميجابايت."],
      ["الملف مش راضي يترفع؟", "اتأكد من نوع الملف وحجمه واتصالك بالإنترنت، وجرّب تاني. وماترفعش بيانات خاصة في الصور أو الملفات."],
    ] },
    { title: "الدعم والخصوصية", icon: ShieldCheck, items: [
      ["أكلم فريق الدعم منين؟", "انزل لآخر الصفحة ودوس «قدّم بلاغ وارفق صورة» عشان تبعت بلاغ خاص لإدارة البرازيلي. داخل الشات هتلاقي زر المشبك لاختيار الصورة."],
      ["أقدر أبعت للاعب أو صاحب ملعب؟", "الشات في التطبيق للدعم الخاص بينك وبين الإدارة بس؛ مفيش محادثات بين اللاعبين."],
    ] },
  ];
  return <>
    <PageHeading eyebrow="إحنا معاك" title="المساعدة والدعم" description="اختار سؤالك وهتلاقي إجابته على طول." />
    <section className="support-faq-list" aria-label="أسئلة بتتكرر كتير">
      {faq.map(group => { const Icon = group.icon; return <section className="support-faq-group" key={group.title}><div className="support-faq-heading"><Icon size={18} /><h2>{group.title}</h2></div><div className="support-faq-items"><Accordion type="single" collapsible>{group.items.map(([question, answer]) => <AccordionItem className="support-faq-item" value={question} key={question}><AccordionTrigger className="support-faq-trigger">{question}</AccordionTrigger><AccordionContent className="support-faq-answer">{answer}</AccordionContent></AccordionItem>)}</Accordion></div></section>; })}
    </section>
    <section className="panel-card support-card support-card-bottom">
      <span className="support-icon"><Headphones size={22} /></span>
      <h2>لسه محتاج مساعدة؟</h2>
      {user ? <><p>ابعت بلاغك لفريق البرازيلي، وارفق صورة أو فيديو أو ملف يوضح المشكلة.</p><button type="button" className="button-primary" onClick={() => void manageSupport()} disabled={openSupport.isPending}>{openSupport.isPending ? <LoaderCircle size={16} className="spin" /> : <Camera size={16} />} قدّم بلاغ وارفق صورة</button></> : <><p>سجّل دخولك عشان تفتح بلاغ خاص وتقدر ترفق صورة.</p><button type="button" className="button-primary" onClick={() => setLocation("/join")}><LogIn size={16} /> سجّل دخولك وقدّم بلاغ</button></>}
    </section>
  </>;
}

function SignInGate({ title, text }: { title: string; text: string }) { const [, setLocation] = useLocation(); return <div className="gate-card"><span className="gate-icon"><ShieldCheck size={23} /></span><h2>{title}</h2><p>{text}</p><button className="button-primary" onClick={() => setLocation("/join")}>سجّل دخولك <ArrowLeft size={16} /></button></div>; }
function Metric({ label, value, icon: Icon, tone }: { label: string; value: React.ReactNode; icon: any; tone: string }) { return <div className="metric-card"><span className={`metric-icon ${tone}`}><Icon size={19} /></span><span><small>{label}</small><b>{value}</b></span><i className="metric-spark">↗</i></div>; }
function LoadingLine({ label }: { label: string }) { return <div className="loading-line"><LoaderCircle size={17} className="spin" />{label}</div>; }
function LockKeyholeIcon() { return <span className="lock-emoji" aria-hidden="true">⌑</span>; }
async function fileToDataUrl(file: File): Promise<string> { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || "")); reader.onerror = () => reject(new Error("ماقدرناش نقرا الملف، جرّب تاني.")); reader.readAsDataURL(file); }); }

export default function Home() {
  const [location, setLocation] = useLocation();
  const route = location.split("?")[0];
  const queryClient = useQueryClient();
  const meQuery = api.auth.me.useQuery(undefined, { retry: false, staleTime: 0, refetchOnWindowFocus: true, refetchOnReconnect: true });
  const realtimeTicketQuery = api.auth.realtimeTicket.useQuery(undefined, { enabled: false, retry: false, staleTime: 0, refetchOnWindowFocus: false });
  const pitchesQuery = api.pitches.list.useQuery(undefined, { retry: false, staleTime: 0, refetchInterval: 5_000, refetchIntervalInBackground: true, refetchOnWindowFocus: true, refetchOnReconnect: true });
  const bookingsQuery = api.bookings.mine.useQuery(undefined, { enabled: Boolean(meQuery.data && !(meQuery.data as any).isSuspended && route === "/profile"), retry: false, staleTime: 0, refetchOnMount: "always", refetchInterval: route === "/profile" ? 30_000 : false, refetchIntervalInBackground: false, refetchOnWindowFocus: true, refetchOnReconnect: true });
  const bookingStatusSync = api.bookings.statusSync.useQuery(undefined, { enabled: Boolean(meQuery.data && !(meQuery.data as any).isSuspended && route === "/profile"), retry: false, staleTime: 0, refetchOnMount: "always", refetchInterval: 10_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true, refetchOnReconnect: true });
  const user = (meQuery.data || null) as User | null;
  useEffect(() => {
    if (!user || user.isSuspended) return;
    let pendingRoots = new Set<string>();
    let flushTimer: number | null = null;
    const disconnect = connectRealtime(async () => {
      const result = await realtimeTicketQuery.refetch();
      if (result.error || !result.data?.token) throw result.error || new Error("ماقدرناش نوثّق قناة التحديثات، جرّب تاني.");
      return result.data.token as string;
    }, event => {
      event.roots.forEach(root => pendingRoots.add(root));
      if (flushTimer !== null) return;
      flushTimer = window.setTimeout(() => {
        flushTimer = null;
        const roots = [...pendingRoots];
        pendingRoots = new Set<string>();
        if (!roots.length) return;
        void queryClient.invalidateQueries({
          predicate: query => {
            const firstKey = query.queryKey[0];
            const path = (Array.isArray(firstKey) ? firstKey : [firstKey]).map(String).join(".");
            return roots.some(root => path === root || path.startsWith(`${root}.`));
          },
          refetchType: "active",
        });
      }, 100);
    }, () => {
      const resumedAt = Date.now();
      void queryClient.invalidateQueries({
        predicate: query => query.state.fetchStatus !== "fetching" && resumedAt - query.state.dataUpdatedAt > 1_000,
        refetchType: "active",
      });
    });
    return () => {
      disconnect();
      if (flushTimer !== null) window.clearTimeout(flushTimer);
    };
  }, [queryClient, realtimeTicketQuery.refetch, user?.id, user?.isSuspended]);
  const pitches = itemsOf(pitchesQuery.data) as Pitch[];
  const syncedPlayerBookingStatuses = new Map<number, Item>();
  for (const item of itemsOf(bookingStatusSync.data)) syncedPlayerBookingStatuses.set(Number(item.id), item as Item);
  const bookings = itemsOf(bookingsQuery.data).map((booking: Item) => {
    const liveStatus = syncedPlayerBookingStatuses.get(Number(booking.id));
    return liveStatus ? { ...booking, status: liveStatus.status, reviewedAt: liveStatus.reviewedAt, updatedAt: liveStatus.updatedAt, qrToken: liveStatus.qrToken ?? booking.qrToken } : booking;
  });
  const isAdminAlias = route === "/admin" || route === "/open/admin";
  const appOpenTarget = useMemo(() => resolveAppOpenTarget(route), [route]);
  const requestedNext = new URLSearchParams(location.split("?")[1] ?? "").get("next");
  const safeLoginNext = requestedNext && /^(?:\/|\/profile(?:\?booking=[1-9]\d*)?)$/.test(requestedNext) ? requestedNext : null;
  useEffect(() => {
    if (isAdminAlias) window.location.replace("/admin-dashboard/");
  }, [isAdminAlias]);
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
  useEffect(() => { const title = route === "/" ? "البرازيلي — ملعبك وماتشك أقرب" : route === "/book" ? "احجز ملعبك | البرازيلي" : route === "/play" ? "اعمل ماتش | البرازيلي" : route === "/rewards" ? "مكافآتي | البرازيلي" : route === "/verify-rewards" ? "التأكد من المكافآت | البرازيلي" : isDownloadRoute ? "حمّل تطبيق البرازيلي الرسمي" : "البرازيلي"; document.title = title; }, [route]);
  if (isAdminAlias) return <main dir="rtl" role="status" style={{ minHeight: "45vh", display: "grid", placeItems: "center" }}>جارٍ فتح لوحة الإدارة… <a href="/admin-dashboard/">لو ما اتنقلتش لوحدك، افتحها من هنا.</a></main>;
  if (isDownloadRoute) return <LazyPage><DownloadPage /></LazyPage>;
  let content: React.ReactNode;
  if (user?.isSuspended) content = <LazyPage><SuspendedAccountPage user={user} /></LazyPage>;
  else if (appOpenTarget) content = <><PageHeading eyebrow="رابط آمن · EL BARZILY" title="بنفتح تطبيق البرازيلي" description="بنجهزلك أسرع طريق للملعب والمساعدة والدعم. لو التطبيق متثبت هيفتح لوحده، ولو مش متثبت هتكمل عادي على الموقع." /><section className="panel-card app-open-card"><div className="app-open-mark"><Zap size={28} /></div><div className="app-open-copy"><span className="eyebrow">اتصال سريع وآمن</span><h2>ثواني وتبقى جوه الملعب</h2><p>ماتقفلش الصفحة وإحنا بنحاول نفتح التطبيق. تقدر تفتح التطبيق المتثبت أو تكمل على نفس الرابط في المتصفح.</p><div className="request-actions"><a className="button-primary" href={appOpenTarget.desktopUri}><Zap size={16} /> افتح التطبيق المتثبت</a><a className="button-outline" href={getAuthAwareOpenPath(appOpenTarget, Boolean(user))}><ShieldCheck size={16} /> كمّل على الموقع</a></div></div><div className="app-open-steps"><span><b>01</b> بنحاول نفتحه</span><span><b>02</b> بنفحص الاتصال</span><span><b>03</b> دخول آمن</span></div></section></>;
  else if (route === "/join") content = user ? <HomeLanding user={user} pitches={pitches} /> : <AuthPanel initialMode="choose-role" />;
  else if (route === "/login") content = user ? <HomeLanding user={user} pitches={pitches} /> : <AuthPanel initialMode="login" />;
  else if (route === "/forgot") content = user ? <HomeLanding user={user} pitches={pitches} /> : <AuthPanel initialMode="forgot" />;
  else if (route === "/") content = user ? <HomeLanding user={user} pitches={pitches} /> : <AuthPanel initialMode="choose-role" />;
  else if (route === "/book" || route.startsWith("/book/")) content = <BookPitch user={user} pitches={pitches} />;
  else if (route === "/play") content = <MatchesPage user={user} pitches={pitches} />;
  else if (route === "/squad") content = <SquadPage user={user} />;
  else if (route === "/chat") content = new URLSearchParams(window.location.search).get("support") === "1" ? <ChatPage user={user} /> : <SupportPage user={user} />;
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
