import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import AdminProvisionForm, { type CreateAdminInput, type LinkAdminInput } from "./AdminProvisionForm";
import { permissionList, permissionOptions } from "./permissions";
import { connectRealtime } from "../../shared/realtime-client";
import DownloadTrendChart from "./DownloadTrendChart";
import AdminQrScanner from "./AdminQrScanner";
import AdminActivityChart from "./AdminActivityChart";
import type { LucideIcon } from "lucide-react";
import { Activity, Bot, ClipboardList, CreditCard, Download, Flag, Gift, LayoutDashboard, MapPin, QrCode, Settings, Share2, ShieldCheck, Users, LifeBuoy, UserRound, Paperclip, ExternalLink, Trophy } from "lucide-react";

type AnyRecord = Record<string, any>;
type TabId = "overview" | "assistant" | "users" | "customerActivity" | "receipts" | "qrLogs" | "subscriptions" | "venues" | "suggestions" | "reports" | "rewards" | "referrals" | "qrScanner" | "settings" | "download" | "admins" | "audit" | "support";
type AdminInstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
const tabIcons: Record<TabId, LucideIcon> = { overview: LayoutDashboard, assistant: Bot, users: Users, customerActivity: Activity, receipts: ClipboardList, qrLogs: QrCode, qrScanner: QrCode, subscriptions: CreditCard, venues: MapPin, suggestions: Flag, reports: Flag, rewards: Gift, referrals: Share2, settings: Settings, download: Download, admins: ShieldCheck, audit: Activity, support: LifeBuoy };
const tabGroupDefinitions: Array<[string, TabId[]]> = [
  ["مركز التحكم", ["overview", "assistant", "audit", "customerActivity"]],
  ["اللاعبين والحجوزات", ["users", "receipts", "qrLogs", "qrScanner", "subscriptions", "reports", "rewards", "referrals"]],
  ["الملاعب", ["venues", "suggestions"]],
  ["الإعدادات والأدوات", ["settings", "download", "admins", "support"]],
];

const API_ORIGIN = (
  import.meta.env.PROD
    ? window.location.origin
    : import.meta.env.VITE_API_ORIGIN || import.meta.env.VITE_API_BASE_URL || window.location.origin
).replace(/\/+$/, "");
const call = async (path: string, input?: unknown, method: "GET" | "POST" = "GET") => {
  const body = input === undefined ? {} : { json: input };
  const payload = encodeURIComponent(JSON.stringify(body));
  const response = await fetch(`${API_ORIGIN}/api/trpc/${path}${method === "GET" ? `?input=${payload}` : ""}`, {
    method,
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) throw new Error(data?.error?.json?.message || data?.error?.message || "ماقدرناش ننفّذ العملية، جرّب تاني.");
  return data?.result?.data?.json ?? data?.result?.data;
};
const mutation = (path: string, input?: unknown) => call(path, input, "POST");
const itemsOf = (value: any): AnyRecord[] => Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : [];
const formatDate = (value: unknown) => value ? new Date(String(value)).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" }) : "—";
const formatMoney = (value: unknown) => value == null || value === "" ? "—" : `${Number(value).toLocaleString("ar-EG")} ج.م`;
const subscriptionCountdown = (value: unknown) => {
  if (!value) return "الاشتراك مش متسجل";
  const remaining = new Date(String(value)).getTime() - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0) return "الاشتراك منتهي";
  const days = Math.ceil(remaining / (24 * 60 * 60 * 1000));
  return days === 1 ? "فاضل يوم واحد" : `فاضل ${days} يوم`;
};
const statusLabel: Record<string, string> = { pending: "مستني المراجعة", pending_profile: "مستني اكتمال الملف", pending_review: "مستني مراجعة الإدارة", qualified: "مؤهّل", campaign_inactive: "الحملة كانت مقفولة", approved: "اتوافق عليه", rejected: "مرفوض", open: "مفتوح", reviewing: "تحت المراجعة", resolved: "اتحل", dismissed: "مقفول", accepted: "مقبول", reviewed: "اتراجع", published: "منشور", draft: "مسودة", suspended: "موقوف", active: "نشط", cancelled: "اتلغى", canceled: "اتلغى", valid: "ساري", used: "مستخدم", expired: "منتهي", closed: "مقفول" };
const statusText = (value: unknown) => statusLabel[String(value)] || String(value || "—");
const roleLabel = (value: unknown) => ({ player: "لاعب", owner: "صاحب ملعب", moderator: "مشرف", admin: "مدير", super_admin: "مدير عام" } as Record<string, string>)[String(value)] || String(value || "—");
const accountTypeLabel = (value: unknown) => ({ player: "لاعب", owner: "صاحب ملعب" } as Record<string, string>)[String(value)] || String(value || "—");
const rewardTypeLabel = (value: unknown) => ({ free_booking: "حجز ملعب ببلاش", product_delivery: "منتج أو توصيل", discount: "خصم", other: "مكافأة تانية" } as Record<string, string>)[String(value)] || String(value || "—");
const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("ماقدرناش نقرا الملف، جرّب ملف تاني.")); reader.readAsDataURL(file); });

function Login({ onDone }: { onDone: (user: AnyRecord) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await mutation("auth.login", { email, password, adminLogin: true });
      onDone(result.user);
    } catch (e: any) {
      setError(e.message || "بيانات الدخول مش صحيحة");
    }
    finally { setBusy(false); }
  };
  return <main className="login-shell"><div className="login-orbit" /><section className="login-card"><div className="brand-mark login-logo"><img src="/brzly-logo.svg" alt="" /></div><span className="overline">لوحة إدارة المشرفين</span><h1>غرفة التحكم<br /><em>للقرارات المهمة.</em></h1><p className="muted">سجّل دخولك للإدارة ببريدك الإلكتروني وكلمة السر.</p><form onSubmit={submit}>
    <label>الإيميل<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="اكتب إيميل المشرف" autoComplete="email" required /></label>
    <label>كلمة السر<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required minLength={8} /></label>
    {error && <div className="error-box">{error}</div>}<button className="gold-button" disabled={busy}>{busy ? "بنتحقق…" : "دخول"}</button>
  </form><small className="security-note">صلاحية جلسة المشرف بتتراجع على الخادم قبل كل إجراء.</small></section></main>;
}

function Panel({ eyebrow, title, action, children, className = "" }: { eyebrow?: string; title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={`panel ${className}`}><div className="panel-head"><div>{eyebrow && <span className="overline">{eyebrow}</span>}<h3>{title}</h3></div>{action}</div>{children}</section>;
}
function Empty({ text = "مفيش بيانات دلوقتي." }: { text?: string }) { return <div className="empty-state">{text}</div>; }
function Status({ value }: { value: unknown }) { return <span className={`status ${["rejected", "dismissed"].includes(String(value)) ? "off" : ""}`}>{statusText(value)}</span>; }
function PermissionPicker({ value, disabled, onChange }: { value: unknown; disabled?: boolean; onChange: (permissions: string[]) => void }) {
  const selected = permissionList(value);
  return <div className="permission-picker">{permissionOptions.map(([id, label]) => <label key={id}><input type="checkbox" checked={selected.includes(id)} disabled={disabled} onChange={() => onChange(selected.includes(id) ? selected.filter(item => item !== id) : [...selected, id])} />{label}</label>)}</div>;
}

function RewardsPanel({ rewards, vouchers, points, pitchTargets, canCancel, onRefresh, onNotice, users, selectedUser, onTargetConsumed }: { rewards: AnyRecord[]; vouchers: AnyRecord[]; points: AnyRecord[]; pitchTargets: AnyRecord[]; canCancel: boolean; onRefresh: () => void; onNotice: (message: string) => void; users: AnyRecord[]; selectedUser: AnyRecord | null; onTargetConsumed: () => void }) {
  const [form, setForm] = useState({ name: "", description: "", rewardType: "free_booking", costPoints: "", terms: "", expiresInDays: "", authorizedType: "admin", authorizedPitchId: "" });
  const [rewardImageFile, setRewardImageFile] = useState<File | null>(null);
  const [rewardImagePreview, setRewardImagePreview] = useState("");
  const [imageBusyId, setImageBusyId] = useState<number | null>(null);
  const [pointsForm, setPointsForm] = useState({ userId: "", amount: "", note: "" });
  const [targetOwnerId, setTargetOwnerId] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (selectedUser) setPointsForm({ userId: String(selectedUser.id), amount: "", note: "" });
  }, [selectedUser?.id]);
  useEffect(() => {
    if (!rewardImagePreview.startsWith("blob:")) return;
    return () => URL.revokeObjectURL(rewardImagePreview);
  }, [rewardImagePreview]);
  const selectedTarget = users.find(item => String(item.id) === pointsForm.userId);
  const owners = Array.from(new Map(pitchTargets.map(item => [String(item.ownerId), item])).values());
  const ownerPitches = pitchTargets.filter(item => !targetOwnerId || String(item.ownerId) === targetOwnerId);
  const uploadRewardImage = async (file: File) => {
    const uploaded = await mutation("uploads.image", { fileName: file.name, mimeType: file.type, dataBase64: (await readFileAsDataUrl(file)).split(",", 2)[1] || "" });
    if (!uploaded?.key) throw new Error("الصورة اترفعت بس التخزين ما رجّعش عنوانها.");
    return `/manus-storage/${uploaded.key}`;
  };
  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (rewardImageFile && (!/^image\/(jpeg|png|webp)$/.test(rewardImageFile.type) || rewardImageFile.size > 5 * 1024 * 1024)) {
      onNotice("ارفع صورة للجايزة بصيغة JPG أو PNG أو WebP، وحجمها مايزيدش عن 5 ميجابايت.");
      return;
    }
    setBusy(true);
    try {
      const imageUrl = rewardImageFile ? await uploadRewardImage(rewardImageFile) : undefined;
      await mutation("adminPortal.rewards.create", { ...form, costPoints: Number(form.costPoints), expiresInDays: form.expiresInDays ? Number(form.expiresInDays) : null, authorizedPitchId: form.authorizedType === "pitch_owner" && form.authorizedPitchId ? Number(form.authorizedPitchId) : null, ...(imageUrl ? { imageUrl } : {}) });
      onNotice("الجايزة الكروية اتضافت، وصورتها هتظهر للاعبين في قائمة الجوايز.");
      setForm({ name: "", description: "", rewardType: "free_booking", costPoints: "", terms: "", expiresInDays: "", authorizedType: "admin", authorizedPitchId: "" });
      setRewardImageFile(null); setRewardImagePreview(""); onRefresh();
    } catch (e: any) { onNotice(e.message || "ماقدرناش نضيف الجايزة، جرّب تاني."); } finally { setBusy(false); }
  };
  const replaceRewardImage = async (item: AnyRecord, file?: File) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) {
      onNotice("ارفع صورة بصيغة JPG أو PNG أو WebP، وحجمها مايزيدش عن 5 ميجابايت.");
      return;
    }
    setImageBusyId(Number(item.id));
    try {
      const imageUrl = await uploadRewardImage(file);
      await mutation("adminPortal.rewards.update", { id: Number(item.id), imageUrl });
      onNotice(`صورة جايزة «${item.name}» اتحدّثت.`); onRefresh();
    } catch (e: any) { onNotice(e.message || "ماقدرناش نحدّث الصورة، جرّب تاني."); } finally { setImageBusyId(null); }
  };
  const adjustPoints = async (event: React.FormEvent) => { event.preventDefault(); try { await mutation("adminPortal.rewards.adjustPoints", { userId: Number(pointsForm.userId), amount: Number(pointsForm.amount), note: pointsForm.note.trim() }); onNotice(`النقاط اتسجلت للاعب ${selectedTarget?.name || `#${pointsForm.userId}`} والحركة اتحفظت.`); setPointsForm({ userId: "", amount: "", note: "" }); onTargetConsumed(); onRefresh(); } catch (e: any) { onNotice(e.message); } };
  const cancel = async (item: AnyRecord) => { const reason = window.prompt("إيه سبب إلغاء القسيمة؟", "إيقاف من الإدارة"); if (!reason) return; try { await mutation("adminPortal.vouchers.cancel", { id: Number(item.id), reason }); onNotice("القسيمة اتلغت ومش هينفع تتستخدم تاني."); onRefresh(); } catch (e: any) { onNotice(e.message); } };
  return <div className="feature-grid">
    <Panel eyebrow="أرصدة المستخدمين" title="إضافة أو خصم رصيد لأي مستخدم">{selectedTarget && <div className="notice-inline">المستهدف: <b>{selectedTarget.name || "لاعب"}</b> · رقم الحساب #{selectedTarget.id}</div>}<form className="form-grid" onSubmit={adjustPoints}><input type="number" min="1" placeholder="رقم الحساب (ID)" value={pointsForm.userId} onChange={e => setPointsForm({ ...pointsForm, userId: e.target.value })} required /><input type="number" placeholder="عدد النقاط (+ إضافة / − خصم)" value={pointsForm.amount} onChange={e => setPointsForm({ ...pointsForm, amount: e.target.value })} required /><input placeholder="سبب الإضافة أو الخصم (إجباري)" value={pointsForm.note} onChange={e => setPointsForm({ ...pointsForm, note: e.target.value })} required /><button className="gold-button" disabled={!canCancel}>تسجيل حركة الرصيد</button></form><div className="record-list compact-list">{points.map(item => <article className="record" key={item.id}><div><b>{item.playerName} · #{item.userId}</b><small>{item.playerEmail}</small></div><strong>{Number(item.balance || 0).toLocaleString("ar-EG")} نقطة</strong></article>)}{!points.length && <Empty text="لسه مفيش أرصدة مسجلة. اختار لاعب من القائمة واهديله نقاط." />}</div></Panel>
    <Panel eyebrow="الجوايز الكروية" title={canCancel ? "إضافة جايزة للاعبين" : "الجوايز (عرض بس)"}>{canCancel && <form className="form-grid" onSubmit={create}><input placeholder="اسم الجايزة" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /><select value={form.rewardType} onChange={e => setForm({ ...form, rewardType: e.target.value })}><option value="free_booking">حجز ملعب ببلاش</option><option value="product_delivery">منتج / توصيل</option><option value="discount">خصم على الملعب</option><option value="other">جايزة تانية</option></select><input type="number" min="1" placeholder="النقط المطلوبة" value={form.costPoints} onChange={e => setForm({ ...form, costPoints: e.target.value })} required /><input type="number" min="1" placeholder="صلاحية القسيمة بالأيام (اختياري)" value={form.expiresInDays} onChange={e => setForm({ ...form, expiresInDays: e.target.value })} /><textarea placeholder="وصف الجايزة وشروط استخدامها" value={form.terms} onChange={e => setForm({ ...form, terms: e.target.value })} /><label className="file-label reward-image-picker"><span>صورة الجايزة (اختياري)</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { const file = e.target.files?.[0] || null; if (file && (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024)) { onNotice("ارفع صورة بصيغة JPG أو PNG أو WebP، وحجمها مايزيدش عن 5 ميجابايت."); e.currentTarget.value = ""; return; } setRewardImageFile(file); setRewardImagePreview(file ? URL.createObjectURL(file) : ""); }} /><small>{rewardImageFile?.name || "ارفع صورة كروية توضح الجايزة"}</small></label>{rewardImagePreview && <img className="reward-admin-preview" src={rewardImagePreview} alt="معاينة صورة الجايزة" />}<select value={form.authorizedType} onChange={e => { setForm({ ...form, authorizedType: e.target.value, authorizedPitchId: "" }); setTargetOwnerId(""); }}><option value="admin">الإدارة</option><option value="pitch_owner">صاحب ملعب محدد</option><option value="rewards_staff">موظف الجوايز</option></select>{form.authorizedType === "pitch_owner" && <><select value={targetOwnerId} onChange={e => { setTargetOwnerId(e.target.value); setForm({ ...form, authorizedPitchId: "" }); }} required><option value="">اختار صاحب الملعب</option>{owners.map(owner => <option key={String(owner.ownerId)} value={String(owner.ownerId)}>{owner.ownerName || "صاحب ملعب"} · {owner.ownerEmail || `#${owner.ownerId}`}</option>)}</select><select value={form.authorizedPitchId} onChange={e => setForm({ ...form, authorizedPitchId: e.target.value })} required><option value="">اختار الملعب المحدد</option>{ownerPitches.map(pitch => <option key={String(pitch.id)} value={String(pitch.id)}>{pitch.name} · {[pitch.address, pitch.city].filter(Boolean).join("، ") || "الموقع مش متسجل"}</option>)}</select></>}<button className="gold-button" disabled={busy}>{busy ? "بتترفع الصورة وبتتحفظ…" : "إضافة الجايزة"}</button></form>}<div className="record-list compact-list">{rewards.map(item => <article className="record reward-admin-record" key={item.id}>{item.imageUrl ? <img className="reward-admin-thumb" src={item.imageUrl} alt="" onError={e => { e.currentTarget.style.visibility = "hidden"; }} /> : <span className="reward-admin-fallback"><Trophy size={18} /></span>}<div><b>{item.name}</b><small>{item.costPoints} نقطة · {rewardTypeLabel(item.rewardType)} · {item.isActive ? "شغالة" : "موقوفة"}</small><small>{item.terms || item.description || "مفيش شروط إضافية"}</small></div>{canCancel && <label className="reward-image-edit">{imageBusyId === Number(item.id) ? "بتتحدّث…" : "تغيير الصورة"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={imageBusyId === Number(item.id)} onChange={e => { const file = e.target.files?.[0]; e.currentTarget.value = ""; void replaceRewardImage(item, file); }} /></label>}</article>)}{!rewards.length && <Empty text="لسه مفيش جوايز اتضافت." />}</div></Panel>
    <Panel eyebrow="القسائم الآمنة" title="سجل القسائم واستخدامها"><div className="record-list">{vouchers.map(item => <article className="record" key={item.id}><div><b>#{item.id} · {item.rewardNameSnapshot}</b><small>{item.playerName || item.playerEmail || `لاعب #${item.userId}`} · {item.pointsCost} نقطة</small><small>اتصدرت: {formatDate(item.issuedAt)} · تنتهي: {formatDate(item.expiresAt)}</small><small>{item.usedByName ? `استخدمها ${item.usedByName} في ${formatDate(item.usedAt)}` : "لسه ما اتستخدمتش"}</small></div><div className="record-side"><Status value={item.status} />{canCancel && item.status === "valid" && <button className="reject-button" onClick={() => void cancel(item)}>إلغاء القسيمة</button>}</div></article>)}{!vouchers.length && <Empty text="لسه مفيش قسائم صادرة." />}</div></Panel>
  </div>;
}

const toLocalDateInput = (value: unknown) => {
  if (!value) return "";
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : "";
};

function ReferralAdminPanel({ data, isAdmin, onRefresh, onNotice }: { data: AnyRecord; isAdmin: boolean; onRefresh: () => void; onNotice: (message: string) => void }) {
  const [form, setForm] = useState({ enabled: false, startsAt: "", endsAt: "", profilePoints: "0", firstQrBookingPoints: "0", dailyReferralLimit: "10", monthlyReferralLimit: "100", shareMessage: "أنا بلعب في البرازيلي، تعالى نلعب سوا! {link}" });
  const [busy, setBusy] = useState(false);
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    const campaign = data?.campaign;
    if (!campaign || initialized) return;
    setForm({
      enabled: Boolean(campaign.enabled),
      startsAt: toLocalDateInput(campaign.startsAt),
      endsAt: toLocalDateInput(campaign.endsAt),
      profilePoints: String(campaign.profilePoints ?? 0),
      firstQrBookingPoints: String(campaign.firstQrBookingPoints ?? 0),
      dailyReferralLimit: String(campaign.dailyReferralLimit ?? 10),
      monthlyReferralLimit: String(campaign.monthlyReferralLimit ?? 100),
      shareMessage: String(campaign.shareMessage || "أنا بلعب في البرازيلي، تعالى نلعب سوا! {link}"),
    });
    setInitialized(true);
  }, [data?.campaign, initialized]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isAdmin || busy) return;
    setBusy(true);
    try {
      await mutation("adminPortal.referrals.updateCampaign", {
        enabled: form.enabled,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
        profilePoints: Number(form.profilePoints),
        firstQrBookingPoints: Number(form.firstQrBookingPoints),
        dailyReferralLimit: Number(form.dailyReferralLimit),
        monthlyReferralLimit: Number(form.monthlyReferralLimit),
        shareMessage: form.shareMessage,
      });
      onNotice(form.enabled ? "إعدادات حملة الدعوات اتحفظت، والحملة هتشتغل في ميعادها." : "الحملة اتقفلت؛ مفيش نقاط جديدة هتتحسب.");
      onRefresh();
    } catch (error: any) { onNotice(error.message || "ماقدرناش نحفظ إعدادات الحملة."); }
    finally { setBusy(false); }
  };
  const review = async (item: AnyRecord, decision: "approve" | "reject") => {
    const note = decision === "reject" ? window.prompt("اكتب سبب رفض الإحالة عشان يتسجل في المراجعة:", "بيانات الإحالة محتاجة مراجعة") : window.prompt("ملاحظة على قرار الموافقة (اختياري):", "");
    if (decision === "reject" && !note?.trim()) return;
    try {
      await mutation("adminPortal.referrals.review", { referralId: Number(item.id), decision, ...(note?.trim() ? { note: note.trim() } : {}) });
      onNotice(decision === "approve" ? "الإحالة اتراجعت واتحسبت نقاطها حسب إعداد الحملة." : "الإحالة اترفضت والسبب اتحفظ في سجل الإدارة.");
      onRefresh();
    } catch (error: any) { onNotice(error.message || "ماقدرناش نراجع الإحالة."); }
  };
  const metrics = data?.metrics || {};
  const items = itemsOf(data?.items);
  return <div className="feature-grid referrals-admin-grid">
    <Panel eyebrow="إعداد الحملة" title={isAdmin ? "تحكم كامل في الدعوات" : "إعدادات الحملة (عرض بس)"}>
      <div className="notice-inline">زيارات اللينك ومحاولات المشاركة للقياس بس، ومفيش نقاط على الضغط أو النسخ. استحقاق النقط بييجي من حساب جديد بإيميل متأكد وملف مكتمل؛ والبونص الاختياري بيتحسب بعد تحقق QR لحجز اتوافق عليه.</div>
      <form className="form-grid referrals-campaign-form" onSubmit={save}>
        <label className="switch-row referrals-enable"><span><b>{form.enabled ? "الحملة مفعّلة" : "الحملة متوقفة"}</b><small>ابدأ متوقف؛ ماتفعّلش قبل ضبط النقاط والمواعيد.</small></span><input type="checkbox" checked={form.enabled} disabled={!isAdmin || busy} onChange={event => setForm({ ...form, enabled: event.target.checked })} /></label>
        <label>نقط المُحيل بعد اكتمال الملف<input type="number" min="0" max="1000000" value={form.profilePoints} disabled={!isAdmin || busy} onChange={event => setForm({ ...form, profilePoints: event.target.value })} /><small>اللاعب الجديد لازم يكون متأكد الإيميل ومكمّل الاسم والموبايل والمنطقة.</small></label>
        <label>بونص أول حجز QR (اختياري)<input type="number" min="0" max="1000000" value={form.firstQrBookingPoints} disabled={!isAdmin || busy} onChange={event => setForm({ ...form, firstQrBookingPoints: event.target.value })} /><small>المحيل ياخده بعد أول تحقق QR لحجز مقبول؛ مفيش نقاط على حجز لسه مستني.</small></label>
        <label>بداية الحملة (اختياري)<input type="datetime-local" value={form.startsAt} disabled={!isAdmin || busy} onChange={event => setForm({ ...form, startsAt: event.target.value })} /></label>
        <label>نهاية الحملة (اختياري)<input type="datetime-local" value={form.endsAt} disabled={!isAdmin || busy} onChange={event => setForm({ ...form, endsAt: event.target.value })} /></label>
        <label>أقصى إحالات مُكافأة في اليوم<input type="number" min="1" max="10000" value={form.dailyReferralLimit} disabled={!isAdmin || busy} onChange={event => setForm({ ...form, dailyReferralLimit: event.target.value })} /></label>
        <label>أقصى إحالات مُكافأة في الشهر<input type="number" min="1" max="100000" value={form.monthlyReferralLimit} disabled={!isAdmin || busy} onChange={event => setForm({ ...form, monthlyReferralLimit: event.target.value })} /></label>
        <label className="referrals-share-copy">رسالة الدعوة <textarea maxLength={500} value={form.shareMessage} disabled={!isAdmin || busy} onChange={event => setForm({ ...form, shareMessage: event.target.value })} /><small>اكتب ‎{`{link}`}‎ في المكان اللي تحب يظهر فيه لينك اللاعب.</small></label>
        {isAdmin && <button className="gold-button" disabled={busy}>{busy ? "بنحفظ الإعدادات…" : "حفظ إعدادات الدعوات"}</button>}
      </form>
    </Panel>
    <Panel eyebrow="أرقام الحملة" title="من الشير للتسجيل المؤهل"><div className="stats-grid small-stats referral-admin-metrics">{[["زيارات", metrics.visits], ["محاولات مشاركة", metrics.shareAttempts], ["تسجيلات", metrics.signups], ["مؤهلين", metrics.qualified], ["مراجعة مطلوبة", metrics.pendingReview], ["نقط مصروفة", metrics.pointsAwarded]].map(([label, value]) => <article key={String(label)}><small>{label}</small><strong>{Number(value || 0).toLocaleString("ar-EG")}</strong></article>)}</div><div className="notice-inline">عدد المشاركات مش إثبات إن الرسالة اتبعتت فعلًا؛ المنصات الخارجية ماترجّعش تأكيد موثوق. ما بنصرفش مكافأة غير على إحالة حساب حقيقي مستوفي للشروط.</div></Panel>
    <Panel eyebrow="طابور التدقيق" title="الإحالات اللي مستنية مراجعة"><div className="record-list">{items.filter(item => item.status === "pending_review").map(item => <article className="record" key={item.id}><div><b>{item.inviteeName || "لاعب جديد"} · #{item.inviteeId}</b><small>المُحيل: {item.inviterName || "لاعب"} · #{item.inviterId} · {item.inviterEmail || "—"}</small><small>{item.inviteeEmail || "—"} · {formatDate(item.attributedAt)}</small><small>السبب: {item.reviewNote || "محتاج مراجعة"}</small></div><div className="actions"><button className="approve-button" onClick={() => void review(item, "approve")}>موافقة وصرف</button><button className="reject-button" onClick={() => void review(item, "reject")}>رفض مع سبب</button></div></article>)}{!items.some(item => item.status === "pending_review") && <Empty text="مفيش إحالات مستنية مراجعة دلوقتي." />}</div></Panel>
    <Panel eyebrow="آخر الإحالات" title="سجل الدعوات والتسجيلات"><div className="record-list">{items.map(item => <article className="record" key={item.id}><div><b>{item.inviteeName || "لاعب"} · #{item.inviteeId} ← {item.inviterName || "مُحيل"} · #{item.inviterId}</b><small>{item.inviteeEmail || "—"} · اتسجل {formatDate(item.attributedAt)}</small>{item.reviewNote && <small>ملاحظة: {item.reviewNote}</small>}</div><Status value={item.status} /></article>)}{!items.length && <Empty text="لسه مفيش تسجيلات جاية من روابط الدعوة." />}</div></Panel>
  </div>;
}

function Dashboard({ user, onLogout }: { user: AnyRecord; onLogout: () => void }) {
  const role = String(user.role || "");
  const isAdmin = role === "admin" || role === "super_admin";
  const permissions: string[] = Array.isArray(user.moderatorPermissions) ? user.moderatorPermissions : [];
  const can = (scope: string) => isAdmin || permissions.includes(scope);
  const [tab, setTab] = useState<TabId>("overview");
  const [overview, setOverview] = useState<AnyRecord>({});
  const [data, setData] = useState<Record<string, AnyRecord[]>>({ users: [], customerActivity: [], bookings: [], qrLogs: [], subscriptions: [], venues: [], suggestions: [], reports: [], plans: [], rewards: [], vouchers: [], points: [], pitchTargets: [] });
  const [bookingStatusOverrides, setBookingStatusOverrides] = useState<Record<number, string>>({});
  const [admins, setAdmins] = useState<AnyRecord[]>([]);
  const [audit, setAudit] = useState<AnyRecord[]>([]);
  const [referralData, setReferralData] = useState<AnyRecord>({});
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [rejectReason, setRejectReason] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [rewardTarget, setRewardTarget] = useState<AnyRecord | null>(null);
  const [cashNumber, setCashNumber] = useState("");
  const [smartReceipt, setSmartReceipt] = useState(false);
  const [subscriptionRequired, setSubscriptionRequired] = useState(true);
  const [freeTrialEnabled, setFreeTrialEnabled] = useState(false);
  const [freeTrialDays, setFreeTrialDays] = useState("30");
  const [freeTrialForm, setFreeTrialForm] = useState({ userId: "", durationDays: "30" });
  const [planForm, setPlanForm] = useState({ name: "", price: "", durationDays: "30" });
  const [planImageFile, setPlanImageFile] = useState<File | null>(null);
  const [downloadConfig, setDownloadConfig] = useState<AnyRecord>({ mode: "url", appName: "تطبيق البرازيلي", version: "1.0.3", url: "", fileKey: "", windowsUrl: "", windowsFileName: "البرازيلي - التطبيق الرسمي-Windows.exe", supportLink: "/support", supportNumbers: [] });
  const [downloadStats, setDownloadStats] = useState<AnyRecord>({});
  const [apkFile, setApkFile] = useState<File | null>(null);
  const [assistant, setAssistant] = useState<AnyRecord | null>(null);
  const [assistantPrompt, setAssistantPrompt] = useState("");
  const [assistantHistory, setAssistantHistory] = useState<AnyRecord[]>([]);
  const [assistantAnswer, setAssistantAnswer] = useState<AnyRecord | null>(null);
  const [userEdits, setUserEdits] = useState<Record<number, { role: string; permissions: string }>>({});
  const [supportRooms, setSupportRooms] = useState<AnyRecord[]>([]);
  const [supportRoomId, setSupportRoomId] = useState<number | string | null>(null);
  const [supportMessages, setSupportMessages] = useState<AnyRecord[]>([]);
  const [supportMessagesLoading, setSupportMessagesLoading] = useState(false);
  const supportRoomIdRef = useRef<number | string | null>(null);
  const [supportDraft, setSupportDraft] = useState("");
  const [supportFile, setSupportFile] = useState<File | null>(null);
  const [supportBusy, setSupportBusy] = useState(false);
  const [supportProfile, setSupportProfile] = useState<AnyRecord | null>(null);
  const [supportProfileBusy, setSupportProfileBusy] = useState(false);
  const [supportMediaBusy, setSupportMediaBusy] = useState<number | string | null>(null);
  const [supportFilter, setSupportFilter] = useState("all");
  const [adminInstallPrompt, setAdminInstallPrompt] = useState<AdminInstallPrompt | null>(null);
  const [adminInstallMessage, setAdminInstallMessage] = useState("");
  const loadInFlightRef = useRef(false);
  const pendingLoadTabRef = useRef<TabId | null>(null);
  const actionLockRef = useRef(false);
  useEffect(() => {
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/admin-dashboard/admin-sw.js", { scope: "/admin-dashboard/" }).catch(() => undefined);
    const onBeforeInstall = (event: Event) => { event.preventDefault(); setAdminInstallPrompt(event as AdminInstallPrompt); };
    const onInstalled = () => { setAdminInstallPrompt(null); setAdminInstallMessage("لوحة الإدارة اتثبتت كتطبيق على الجهاز."); };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onBeforeInstall); window.removeEventListener("appinstalled", onInstalled); };
  }, []);
  const installAdminApp = async () => {
    if (!adminInstallPrompt) {
      setAdminInstallMessage("من قائمة المتصفح اختار «تثبيت التطبيق» أو «Install app» لتثبيت لوحة الإدارة فقط.");
      return;
    }
    try {
      await adminInstallPrompt.prompt();
      const choice = await adminInstallPrompt.userChoice;
      setAdminInstallMessage(choice.outcome === "accepted" ? "جاري تثبيت لوحة الإدارة كتطبيق مستقل." : "تقدر تثبّت لوحة الإدارة بعدين من قائمة المتصفح.");
      setAdminInstallPrompt(null);
    } catch { setAdminInstallMessage("افتح قائمة المتصفح واختار تثبيت لوحة الإدارة كتطبيق."); }
  };

  const updateList = (key: string, value: any) => setData(previous => ({ ...previous, [key]: itemsOf(value) }));

  const loadTab = useCallback(async (target: TabId = tab, silent = false) => {
    if (loadInFlightRef.current) { pendingLoadTabRef.current = target; return; }
    loadInFlightRef.current = true;
    if (!silent) setLoading(true);
    try {
      if (target === "overview") setOverview(await call("admin.overview"));
      if (target === "users" && (can("users") || can("suspend"))) updateList("users", await call("admin.users"));
      if (target === "customerActivity" && isAdmin) updateList("customerActivity", await call("adminPortal.customerActivity"));
      if (target === "receipts" && can("receipts")) updateList("bookings", await call("admin.bookings"));
      if (target === "qrLogs" && can("receipts")) updateList("qrLogs", await call("admin.qrLogs"));
      if (target === "subscriptions" && (can("receipts") || can("subscriptions"))) updateList("subscriptions", await call("admin.subscriptionRequests"));
      if (target === "venues" && can("pitches")) updateList("venues", (await call("admin.allPitches"))?.items || []);
      if (target === "suggestions" && can("pitches")) updateList("suggestions", await call("suggestions.list"));
      if (target === "reports" && can("reports")) updateList("reports", await call("reports.list"));
      if (target === "rewards" && can("rewards")) { const [catalog, vouchers, points, pitchTargets] = await Promise.all([call("adminPortal.rewards.list"), call("adminPortal.vouchers.list"), call("adminPortal.rewards.points"), call("adminPortal.rewards.pitchTargets")]); updateList("rewards", catalog); updateList("vouchers", vouchers); updateList("points", points); updateList("pitchTargets", pitchTargets); }
      if (target === "referrals" && can("referrals")) setReferralData(await call("adminPortal.referrals.snapshot"));
      if (target === "admins" && role === "super_admin") { const result = await call("adminPortal.admins.list"); setAdmins(itemsOf(result)); }
      if (target === "audit" && isAdmin) { const result = await call("adminPortal.audit"); setAudit(itemsOf(result)); }
      if (target === "settings" && can("settings")) {
        const [plans, smart] = await Promise.all([call("subscriptions.plans"), call("admin.smartReceiptVerification")]);
        updateList("plans", plans); setCashNumber(String(plans?.vodafoneCashNumber || "")); setSmartReceipt(Boolean(smart?.enabled)); setSubscriptionRequired(plans?.subscriptionRequired !== false); setFreeTrialEnabled(plans?.freeTrialEnabled === true); setFreeTrialDays(String(plans?.freeTrialDays || 30));
        if (isAdmin) updateList("users", await call("admin.users"));
      }
      if (target === "download" && can("downloads")) { const [config, stats] = await Promise.all([call("downloadSettings.admin"), call("downloadSettings.stats")]); setDownloadConfig(config); setDownloadStats(stats); }
      if (target === "assistant" && isAdmin) setAssistant(await call("adminAssistant.snapshot"));
      if (target === "support" && can("support")) setSupportRooms(itemsOf(await call("support.adminList")));
    } catch (e: any) { if (!silent) setNotice(e.message || "ماقدرناش نحمل القسم"); }
    finally {
      loadInFlightRef.current = false;
      if (!silent) setLoading(false);
      const pending = pendingLoadTabRef.current;
      if (pending) {
        pendingLoadTabRef.current = null;
        window.setTimeout(() => { void loadTab(pending, true); }, 0);
      }
    }
  }, [tab, role, permissions.join(",")]);
  useEffect(() => {
    if (tab === "support") return;
    return connectRealtime(async () => {
      const result = await call("auth.realtimeTicket");
      if (!result?.token) throw new Error("ماقدرناش نأمّن قناة التحديثات");
      return result.token;
    }, event => {
      if (event.adminAreas.includes(tab)) void loadTab(tab, true);
    }, () => { void loadTab(tab, true); });
  }, [user.id, tab, loadTab]);
  useEffect(() => {
    void loadTab(tab);
    if (!["overview", "receipts", "subscriptions", "support", "referrals"].includes(tab)) return;
    const interval = tab === "overview" ? 30000 : tab === "support" ? 15000 : tab === "referrals" ? 30000 : 15000;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && !actionLockRef.current) void loadTab(tab, true);
    }, interval);
    return () => window.clearInterval(timer);
  }, [tab, loadTab]);
  useEffect(() => {
    if (tab !== "receipts" || !can("receipts")) return;
    let active = true;
    let inFlight = false;
    const syncBookingStatuses = async () => {
      if (!active || inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const result = await call("admin.bookingStatusSync");
        if (!active) return;
        const statuses = new Map<number, AnyRecord>();
        for (const item of itemsOf(result)) statuses.set(Number(item.id), item);
        setData(previous => ({
          ...previous,
          bookings: (previous.bookings || []).map((booking: AnyRecord) => {
            const latest = statuses.get(Number(booking.id));
            return latest ? { ...booking, status: latest.status, reviewedAt: latest.reviewedAt } : booking;
          }),
        }));
      } catch { /* silent status sync; the full list retains its normal retry path */ }
      finally { inFlight = false; }
    };
    void syncBookingStatuses();
    const timer = window.setInterval(() => { void syncBookingStatuses(); }, 10_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [tab, role, permissions.join(",")]);
  useEffect(() => {
    if (tab !== "support" || !supportRoomId || !can("support")) return;
    let active = true;
    let inFlight = false;
    const fetchMessages = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const result = await call("support.adminMessages", { roomId: supportRoomId });
        if (active && supportRoomIdRef.current === supportRoomId) setSupportMessages(itemsOf(result));
      }
      catch (e: any) {
        if (active && supportRoomIdRef.current === supportRoomId) setNotice(e.message || "ماقدرناش نحمّل رسايل الدعم، جرّب تحدّث الصفحة.");
      }
      finally {
        inFlight = false;
        if (active && supportRoomIdRef.current === supportRoomId) setSupportMessagesLoading(false);
      }
    };
    void fetchMessages();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void fetchMessages(); }, 3_000);
    const disconnectRealtime = connectRealtime(async () => {
      const result = await call("auth.realtimeTicket");
      if (!result?.token) throw new Error("ماقدرناش نأمّن قناة التحديثات");
      return result.token;
    }, event => {
      if (event.roots.includes("support") || event.roots.includes("chat")) {
        void loadTab("support", true);
        void fetchMessages();
      }
    }, () => {
      void loadTab("support", true);
      if (document.visibilityState === "visible") void fetchMessages();
    });
    return () => { active = false; window.clearInterval(timer); disconnectRealtime(); };
  }, [tab, supportRoomId, role, permissions.join(","), loadTab]);

  const refresh = () => { if (!actionLockRef.current) void loadTab(tab); };
  const act = async (path: string, input: AnyRecord, message: string, nextTab: TabId = tab, onSuccess?: () => void) => {
    if (actionLockRef.current) return;
    actionLockRef.current = true; setLoading(true); setNotice("بنعمل الإجراء…");
    try { await mutation(path, input); await loadTab(nextTab); onSuccess?.(); setNotice(message); }
    catch (e: any) { setNotice(e.message); }
    finally { actionLockRef.current = false; setLoading(false); }
  };
  const createAdmin = async (input: CreateAdminInput) => { await mutation("adminPortal.admins.create", input); setNotice("حساب المشرف اتعمل بالإيميل المحدد."); await loadTab("admins"); };
  const linkExistingAdmin = async (input: LinkAdminInput) => { await mutation("adminPortal.admins.linkExisting", input); setNotice("الحساب الموجود اتربط بالصلاحيات المحددة، من غير ما بياناته تتغير."); await loadTab("admins"); };
  const selectSupportRoom = (roomId: number | string) => {
    supportRoomIdRef.current = roomId;
    setSupportRoomId(roomId);
    setSupportMessages([]);
    setSupportMessagesLoading(true);
    setSupportDraft("");
    setSupportFile(null);
    setSupportProfile(null);
  };
  const saveAdminEdit = async (admin: AnyRecord) => { const edit = userEdits[admin.id] || { role: admin.role, permissions: (admin.moderatorPermissions || []).join(",") }; await act("adminPortal.admins.update", { userId: admin.id, role: edit.role, permissions: edit.permissions.split(",").map(x => x.trim()).filter(Boolean), isSuspended: Boolean(admin.isSuspended) }, "دور المشرف وصلاحياته اتحدّثوا.", "admins"); };
  const changeAdminState = async (admin: AnyRecord) => await act("adminPortal.admins.update", { userId: admin.id, isSuspended: !admin.isSuspended }, admin.isSuspended ? "المشرف اتفعّل." : "المشرف اتوقف.", "admins");
  const removeAdmin = async (admin: AnyRecord) => { if (window.confirm(`تشيل صلاحيات ${admin.name || admin.email}؟`)) await act("adminPortal.admins.remove", { userId: admin.id }, "تمت تشيل صلاحيات المشرف.", "admins"); };
  const changeUserState = async (item: AnyRecord) => await act("admin.updateModerator", { userId: Number(item.id), isSuspended: !item.isSuspended }, item.isSuspended ? "الحساب اتفعّل." : "الحساب اتوقف.", "users");
  const copyUserId = async (item: AnyRecord) => {
    try { await navigator.clipboard.writeText(String(item.id)); setNotice(`رقم الحساب #${item.id} اتنسخ.`); }
    catch { setNotice(`رقم الحساب هو #${item.id}.`); }
  };
  const openPointsForUser = (item: AnyRecord) => { setRewardTarget(item); setTab("rewards"); };
  const deleteUserAccount = async (item: AnyRecord) => {
    if (role !== "super_admin") return;
    const accepted = window.confirm(`تحذير نهائي: هيتحذف حساب ${item.name || item.email || `#${item.id}`} وكل السجلات المرتبطة بيه، ومنها الحجوزات والملاعب والمباريات والمحادثات وطلبات الاشتراك والملفات. الحذف نهائي ومش بيتراجع. تكمل؟`);
    if (!accepted) return;
    const confirmation = window.prompt(`اكتب رقم الحساب ${item.id} بالحرف عشان تأكد الحذف النهائي.`);
    if (confirmation?.trim() !== String(item.id)) { setNotice("رقم الحساب مش مطابق؛ الحذف اتلغى."); return; }
    if (actionLockRef.current) return;
    actionLockRef.current = true; setLoading(true); setNotice("بنحذف الحساب وكل البيانات المرتبطة بيه…");
    try {
      const result = await mutation("admin.deleteUser", { userId: Number(item.id), confirmation: confirmation.trim() });
      await loadTab("users");
      setNotice(result?.storageCleanupComplete ? `الحساب #${item.id} اتحذف نهائيًا بكل بياناته وملفاته المرتبطة.` : `الحساب #${item.id} وبياناته اتحذفوا، بس تعذر تنظيف بعض الملفات المرفقة؛ راجع إعدادات التخزين.`);
    } catch (e: any) { setNotice(e.message || "ماقدرناش نحذف الحساب، جرّب تاني."); }
    finally { actionLockRef.current = false; setLoading(false); }
  };
  const saveUserRole = async (item: AnyRecord) => {
    const defaultRole = item.role === "moderator" ? "moderator" : item.accountType === "owner" ? "owner" : "player";
    const edit = userEdits[item.id] || { role: defaultRole, permissions: (item.moderatorPermissions || []).join(",") };
    const permissions = edit.role === "moderator" ? edit.permissions.split(",").map(x => x.trim()).filter(Boolean) : [];
    try {
      await mutation("admin.updateModerator", { userId: Number(item.id), role: edit.role, permissions });
      setUserEdits(previous => { const next = { ...previous }; delete next[item.id]; return next; });
      setNotice("الدور والصلاحيات اتحدّثوا.");
      await loadTab("users");
    } catch (error: any) {
      setNotice(error.message || "ماقدرناش نحفظ الدور والصلاحيات.");
    }
  };
  const reviewSubscription = async (item: AnyRecord, status: "approved" | "rejected") => await act("admin.reviewSubscription", { id: Number(item.id), status, note: rejectReason || undefined }, status === "approved" ? "الاشتراك اتقبل والحساب اتفعّل." : "الاشتراك اترفض والسبب اتبعت.", "subscriptions");
  const reviewPitch = async (item: AnyRecord, decision: "approve" | "reject") => await act("admin.reviewPitch", { id: Number(item.id), decision, reason: rejectReason || undefined }, decision === "approve" ? "الملعب اتوافق عليه واتنشر." : "صفحة الملعب اترفضت.", "venues");
  const updatePitchStatus = async (item: AnyRecord, status: "published" | "suspended" | "rejected" | "draft") => await act("admin.updatePitchStatus", { id: Number(item.id), status, reason: rejectReason || undefined }, status === "published" ? "الملعب اتنشر تاني." : status === "suspended" ? "الملعب اتوقف." : "حالة الملعب اتحدّثت.", "venues");
  const reviewBooking = async (item: AnyRecord, status: "approved" | "rejected" | "cancelled") => await act("admin.reviewBooking", { id: Number(item.id), status, note: rejectReason || undefined }, status === "approved" ? "الحجز اتقبل واتصدر له QR." : status === "rejected" ? "الحجز اترفض." : "الحجز اتلغى.", "receipts", () => { setBookingStatusOverrides(previous => ({ ...previous, [Number(item.id)]: status })); setData(previous => ({ ...previous, bookings: (previous.bookings || []).map((booking: AnyRecord) => Number(booking.id) === Number(item.id) ? { ...booking, status, reviewedAt: new Date() } : booking) })); });
  const reviewSuggestion = async (item: AnyRecord, status: "accepted" | "rejected") => await act("suggestions.review", { id: Number(item.id), status }, status === "accepted" ? "الاقتراح اتقبل." : "الاقتراح اترفض.", "suggestions");
  const reviewReport = async (item: AnyRecord, status: "reviewing" | "resolved" | "dismissed") => await act("reports.review", { id: Number(item.id), status, resolution: rejectReason || undefined }, status === "reviewing" ? "تم وضع البلاغ تحت المراجعة." : status === "resolved" ? "البلاغ اتحل والإجراء اتسجل." : "البلاغ اتقفل والسبب اتبعت.", "reports");
  const saveCash = async (event: React.FormEvent) => { event.preventDefault(); await act("admin.updateSettings", { key: "vodafone_cash_number", value: cashNumber.trim() }, "رقم Vodafone Cash اتحدّث.", "settings"); };
  const saveGlobalFreeTrial = async (event: React.FormEvent) => { event.preventDefault(); const days = Math.max(1, Math.min(3650, Number(freeTrialDays || 30))); try { await Promise.all([mutation("admin.updateSettings", { key: "owner_free_trial_enabled", value: freeTrialEnabled ? "on" : "off" }), mutation("admin.updateSettings", { key: "owner_free_trial_days", value: String(days) })]); setFreeTrialDays(String(days)); setNotice(freeTrialEnabled ? `العرض المجاني للكباتن الجدد شغال لمدة ${days} يوم.` : "العرض المجاني للكباتن الجدد متوقف."); } catch (e: any) { setNotice(e.message || "ماقدرناش نحفظ إعداد العرض المجاني."); } };
  const toggleOwnerSubscriptions = async () => { const next = !subscriptionRequired; setSubscriptionRequired(next); try { await mutation("admin.updateSettings", { key: "owner_subscription_required", value: next ? "on" : "off" }); setNotice(next ? "اشتراكات أصحاب الملاعب اتفتحت والدفع ظاهر دلوقتي." : "اشتراكات أصحاب الملاعب اتقفلت؛ التسجيل هيكون من غير دفع أو إيصال."); } catch (e: any) { setSubscriptionRequired(!next); setNotice(e.message || "ماقدرناش نغيّر حالة الاشتراكات."); } };
  const grantFreeTrial = async (event: React.FormEvent) => { event.preventDefault(); if (!freeTrialForm.userId) { setNotice("اختار الكابتن الأول."); return; } try { await mutation("admin.grantOwnerFreeTrial", { userId: Number(freeTrialForm.userId), durationDays: Number(freeTrialForm.durationDays) }); setNotice(`تم تفعيل اشتراك مجاني لمدة ${freeTrialForm.durationDays} يوم للكابتن.`); setFreeTrialForm({ userId: "", durationDays: "30" }); await loadTab("settings"); } catch (e: any) { setNotice(e.message || "ماقدرناش نفعّل التجربة المجانية."); } };
  const toggleSmart = async () => { const next = !smartReceipt; setSmartReceipt(next); try { await mutation("admin.setSmartReceiptVerification", { enabled: next }); setNotice(next ? "التحقق الذكي من الإيصالات اتفعّل." : "التحقق الذكي اتوقف."); } catch (e: any) { setSmartReceipt(!next); setNotice(e.message); } };
  const addPlan = async (event: React.FormEvent) => { event.preventDefault(); let imageUrl: string | undefined; if (planImageFile) { if (!/^image\/(jpeg|png|webp)$/.test(planImageFile.type) || planImageFile.size > 8 * 1024 * 1024) { setNotice("ارفع صورة للباقة بصيغة JPG أو PNG أو WebP، وحجمها مايزيدش عن 8 ميجابايت."); return; } const uploaded = await mutation("uploads.image", { fileName: planImageFile.name, mimeType: planImageFile.type, dataBase64: (await readFileAsDataUrl(planImageFile)).split(",", 2)[1] || "" }); imageUrl = uploaded.url; } await act("admin.createPlan", { name: planForm.name, price: Number(planForm.price), durationDays: Number(planForm.durationDays), ...(imageUrl ? { imageUrl } : {}) }, "الباقة اتضافت.", "settings"); setPlanForm({ name: "", price: "", durationDays: "30" }); setPlanImageFile(null); };
  const editPlan = async (plan: AnyRecord) => { const name = window.prompt("اسم الباقة", String(plan.name || "")); if (name === null) return; const price = window.prompt("السعر بالجنيه", String(plan.price || "")); if (price === null) return; const durationDays = window.prompt("المدة بالأيام", String(plan.durationDays || 30)); if (durationDays === null) return; await act("admin.updatePlan", { id: Number(plan.id), name: name.trim(), price: Number(price), durationDays: Number(durationDays) }, "الباقة اتحدّثت.", "settings"); };
  const saveDownload = async (event: React.FormEvent) => { event.preventDefault(); try { let next = { ...downloadConfig }; if (apkFile) { const dataBase64 = await readFileAsDataUrl(apkFile); const uploaded = await mutation("downloadSettings.apk", { fileName: apkFile.name, dataBase64 }); next = { ...next, mode: "upload", fileKey: uploaded.key, url: `/manus-storage/${uploaded.key}` }; } await mutation("downloadSettings.save", { mode: next.mode || null, fileKey: next.fileKey || undefined, url: next.mode === "url" ? next.url : undefined, appName: next.appName, version: next.version, windowsUrl: next.windowsUrl, windowsFileName: next.windowsFileName, supportLink: next.supportLink, supportNumbers: Array.isArray(next.supportNumbers) ? next.supportNumbers : String(next.supportNumbers || "").split(/[\n,;]+/).filter(Boolean) }); setApkFile(null); setNotice("إعدادات APK وWindows اتحفظت."); await loadTab("download"); } catch (e: any) { setNotice(e.message); } };
  const askAssistant = async (event: React.FormEvent) => { event.preventDefault(); if (!assistantPrompt.trim()) return; setNotice(""); try { const result = await mutation("adminAssistant.ask", { prompt: assistantPrompt.trim(), history: assistantHistory.slice(-8) }); setAssistantAnswer(result); setAssistantHistory(previous => [...previous, { role: "user", content: assistantPrompt.trim() }, { role: "assistant", content: result.answer }]); setAssistantPrompt(""); } catch (e: any) { setNotice(e.message); } };
  const executeAssistantAction = async () => { const action = assistantAnswer?.action; if (!action) return; try { if (action.type === "reply_reports") await mutation("adminAssistant.sendReportReply", { reportIds: action.reportIds, message: action.message }); else if (action.type === "owner_access") await mutation("adminAssistant.setOwnerAccess", { ownerId: action.ownerId, suspended: action.suspended }); else { if (!window.confirm(`تأكيد أول: سيتم حذف حساب ${action.userName || "المستخدم"} نهائيًا بكل سجلاته المرتبطة. لا يمكن التراجع. هل تريد المتابعة؟`)) return; const confirmation = window.prompt(`تأكيد ثانٍ: اكتب رقم الحساب ${action.userId} بالحرف لتنفيذ الحذف النهائي.`); if (confirmation?.trim() !== String(action.userId)) { setNotice("التأكيد الثاني غير مطابق؛ تم إلغاء الحذف."); return; } await mutation("admin.deleteUser", { userId: action.userId, confirmation: confirmation.trim() }); } setNotice("الإجراء اتنفّذ بعد التأكيد."); setAssistantAnswer(null); await loadTab("assistant"); } catch (e: any) { setNotice(e.message); } };

  const sendSupportReply = async (event: React.FormEvent) => {
    event.preventDefault(); const roomId = supportRoomId; const body = supportDraft.trim(); const file = supportFile; if (!roomId || (!body && !file) || supportBusy) return;
    const optimisticId = body && !file ? -Date.now() : null;
    if (optimisticId !== null) setSupportMessages(previous => [...previous, { id: optimisticId, roomId, senderId: user.id, senderName: "فريق الدعم", senderRole: user.role, body, messageType: "text", createdAt: new Date().toISOString(), deliveryState: "pending" }]);
    setSupportBusy(true);
    try {
      let messageType: "text" | "voice" | "image" | "video" | "file" = "text";
      let mediaAssetId: number | undefined;
      let durationSeconds: number | undefined;
      if (file) {
        const maxBytes = file.type.startsWith("audio/") ? 4_500_000 : file.type.startsWith("video/") ? 30 * 1024 * 1024 : 10 * 1024 * 1024;
        if (file.size > maxBytes) throw new Error(`حجم الملف أكبر من المسموح (${Math.round(maxBytes / 1024 / 1024)} ميغابايت).`);
        const dataBase64 = (await readFileAsDataUrl(file)).split(",", 2)[1] || "";
        if (file.type.startsWith("audio/")) {
          messageType = "voice";
          const objectUrl = URL.createObjectURL(file);
          try {
            const audio = new Audio(objectUrl);
            await new Promise<void>((resolve, reject) => { audio.onloadedmetadata = () => resolve(); audio.onerror = () => reject(new Error("ماقدرناش نعرف مدة التسجيل الصوتي.")); });
            durationSeconds = Math.max(1, Math.min(60, Math.round(audio.duration || 1)));
          } finally { URL.revokeObjectURL(objectUrl); }
          const uploaded = await mutation("uploads.voice", { roomId: Number(roomId), fileName: file.name, mimeType: file.type, dataBase64, durationSeconds });
          mediaAssetId = Number(uploaded.assetId);
        } else {
          messageType = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "file";
          const uploaded = await mutation("uploads.chatMedia", { roomId: Number(roomId), fileName: file.name, mimeType: file.type || "application/octet-stream", dataBase64, messageType });
          mediaAssetId = Number(uploaded.assetId);
        }
      }
      const sent = await mutation("support.adminReply", { roomId, body, messageType, ...(mediaAssetId ? { mediaAssetId } : {}), ...(durationSeconds ? { durationSeconds } : {}) });
      if (optimisticId !== null && supportRoomIdRef.current === roomId && Number(sent?.messageId)) setSupportMessages(previous => previous.map(item => Number(item.id) === optimisticId ? { ...item, id: Number(sent.messageId), deliveryState: "sent" } : item));
      if (supportRoomIdRef.current === roomId) {
        setSupportDraft(""); setSupportFile(null);
        const result = await call("support.adminMessages", { roomId });
        if (supportRoomIdRef.current === roomId) setSupportMessages(itemsOf(result));
      }
      await loadTab("support");
    }
    catch (e: any) {
      if (optimisticId !== null && supportRoomIdRef.current === roomId) setSupportMessages(previous => previous.filter(item => Number(item.id) !== optimisticId));
      if (supportRoomIdRef.current === roomId) setNotice(e.message || "ماقدرناش نبعت الرد");
    } finally { setSupportBusy(false); }
  };
  const setSupportRoomStatus = async (status: "open" | "pending" | "resolved" | "closed") => {
    const roomId = supportRoomId;
    if (!roomId || supportBusy) return; setSupportBusy(true);
    try { await mutation("support.setStatus", { roomId, status }); await loadTab("support"); if (supportRoomIdRef.current === roomId) setNotice(status === "resolved" || status === "closed" ? "حالة المحادثة اتحدّثت." : "المحادثة اتفتحت تاني."); }
    catch (e: any) { if (supportRoomIdRef.current === roomId) setNotice(e.message || "ماقدرناش نحدّث الحالة، جرّب تاني."); } finally { setSupportBusy(false); }
  };
  const showSupportProfile = async () => {
    const roomId = supportRoomId;
    const room = supportRooms.find(item => item.roomId === roomId); if (!room?.requesterId || supportProfileBusy) return;
    setSupportProfileBusy(true); try { const result = await call("support.adminProfile", { userId: room.requesterId }); if (supportRoomIdRef.current === roomId) setSupportProfile(result?.user ? result : { user: result?.user || result, bookings: result?.bookings || [] }); }
    catch (e: any) { if (supportRoomIdRef.current === roomId) setNotice(e.message || "ماقدرناش نحمّل بيانات المستخدم، جرّب تاني."); } finally { setSupportProfileBusy(false); }
  };
  const openSupportMedia = async (message: AnyRecord) => {
    if (supportMediaBusy === message.id) return; setSupportMediaBusy(message.id);
    try { const result = await call("support.mediaUrl", { messageId: message.id }); if (result?.url) window.open(result.url, "_blank", "noopener,noreferrer"); else setNotice("الرابط مش متاح دلوقتي."); }
    catch (e: any) { setNotice(e.message || "ماقدرناش نفتح المرفق، جرّب تاني."); } finally { setSupportMediaBusy(null); }
  };

  const navTabs = useMemo(() => ([
    ["overview", "الرئيسية", true], ["assistant", "المساعد", isAdmin], ["users", "المستخدمين", can("users") || can("suspend")], ["customerActivity", "نشاط العملاء", isAdmin], ["receipts", "الحجوزات والإيصالات", can("receipts")], ["qrLogs", "سجلات QR", can("receipts")], ["subscriptions", "الاشتراكات", can("receipts") || can("subscriptions")], ["venues", "الملاعب", can("pitches")], ["suggestions", "اقتراحات الملاعب", can("pitches")], ["reports", "البلاغات", can("reports")], ["rewards", "المكافآت", can("rewards")], ["referrals", "الدعوات والإحالات", can("referrals")], ["qrScanner", "ماسح QR الإدارة", isAdmin], ["settings", "الإعدادات", can("settings")], ["download", "التنزيلات", can("downloads")], ["admins", "المشرفين", role === "super_admin"], ["audit", "سجل النشاط", isAdmin], ["support", "الدعم", can("support")],
  ] as [TabId, string, boolean][]).filter(item => item[2]), [role, isAdmin, permissions.join(",")]);
  const titles: Record<string, string> = Object.fromEntries(navTabs.map(([id, label]) => [id, label]));
  const navGroups = tabGroupDefinitions.map(([label, ids]) => ({ label, tabs: navTabs.filter(([id]) => ids.includes(id)) })).filter(group => group.tabs.length > 0);
  const visibleUsers = data.users.filter(item => {
    const matchesFilter = filter === "all" || (filter === "player" ? item.accountType === "player" : filter === "owner" ? item.accountType === "owner" : item.role === "moderator");
    const query = userSearch.trim().toLowerCase();
    return matchesFilter && (!query || [item.name, item.email, item.phone, item.id].some(value => String(value ?? "").toLowerCase().includes(query)));
  });
  const stats = [["المستخدمين", overview.users], ["الملاعب", overview.pitches], ["الحجوزات", overview.bookings], ["إيراد الحجوزات المؤكد", formatMoney(overview.revenue ?? 0)], ["بلاغات مفتوحة", overview.openReports], ["اشتراكات مستنية المراجعة", overview.pendingSubscriptions]];
  const bookingRows = data.bookings.map(item => bookingStatusOverrides[Number(item.id)] ? { ...item, status: bookingStatusOverrides[Number(item.id)] } : item);

  return <div className="app-shell"><aside className="sidebar"><div className="side-brand"><span className="side-logo"><img src="/brzly-logo.svg" alt="" /></span><div><b>البرازيلي</b><small>لوحة التحكم</small></div></div><nav aria-label="أقسام الإدارة">{navGroups.map(group => <div className="nav-group" key={group.label}><span className="nav-group-title">{group.label}</span>{group.tabs.map(([id, label]) => { const Icon = tabIcons[id]; return <button className={tab === id ? "active" : ""} aria-current={tab === id ? "page" : undefined} title={label} onClick={() => setTab(id)} key={id}><Icon size={17} strokeWidth={1.8} /><span>{label}</span></button>; })}</div>)}</nav><div className="side-user"><span>{(user.name || user.email || "م").slice(0, 1)}</span><div><b>{user.name || "مدير النظام"}</b><small>{role === "super_admin" ? "المدير العام" : role === "admin" ? "مدير" : "مشرف"}</small></div><button onClick={onLogout}>خروج</button></div></aside><main className="content"><header className="topbar"><div><span className="overline">البرازيلي / الإدارة</span><h2>{titles[tab]}</h2></div><div className="topbar-actions"><button className="install-admin-button" onClick={() => void installAdminApp()}><Download size={15} /> تثبيت</button><button className="refresh-button" onClick={refresh}>تحديث</button><div className="live-pill"><span /> لوحة آمنة · تحديث كل 30 ثانية</div></div></header>{adminInstallMessage && <div className="notice install-notice" onClick={() => setAdminInstallMessage("")}>{adminInstallMessage}</div>}{notice && <div className="notice" onClick={() => setNotice("")}>{notice}</div>}{loading && <div className="loading-bar" />}

    {tab === "overview" && <>
      <section className="hero-panel"><div><span className="overline">معلومات الإدارة</span><h1>كل قرار واضح.<br /><em>وكل حركة متسجلة.</em></h1><p>كل أقسام لوحة الإدارة القديمة بقت متاحة من مكان واحد، بنفس الصلاحيات والخادم المشترك.</p></div><div className="hero-ring"><b>{overview.pendingBookings ?? 0}</b><small>حجوزات محتاجة متابعة</small></div></section>
      <section className="stats-grid">{stats.map(([label, value]) => <article key={String(label)}><small>{label}</small><strong>{value ?? "—"}</strong><span>تحديث مباشر</span></article>)}</section>
      <AdminActivityChart data={overview.dailyActivity || []} />
      <div className="feature-grid"><Panel eyebrow="متابعة الطلبات" title="طلبات محتاجة قرار"><div className="quick-actions">{can("receipts") && <button onClick={() => setTab("subscriptions")}>طلبات الاشتراك <b>{overview.pendingSubscriptions ?? 0}</b></button>}{can("reports") && <button onClick={() => setTab("reports")}>البلاغات المفتوحة <b>{overview.openReports ?? 0}</b></button>}{isAdmin && <button onClick={() => setTab("venues")}>صفحات الملاعب تحت المراجعة <b>افتح القسم</b></button>}{isAdmin && <button onClick={() => setTab("download")}>إدارة ملفات التطبيق <b>APK / Windows</b></button>}</div></Panel><Panel eyebrow="الأقسام اللي اتنقلت" title="كل مميزات لوحة الإدارة القديمة"><div className="feature-tags">{["المستخدمين", "الحجوزات والإيصالات", "الاشتراكات", "سجلات QR", "الدعم", "اعتماد الملاعب", "الاقتراحات", "البلاغات", "الباقات", "التنزيلات", "المساعد"].map(item => <span key={item}>{item}</span>)}</div></Panel></div>
    </>}

    {tab === "assistant" && <Panel eyebrow="مساعد الإدارة" title="مساعد الإدارة الذكي"><div className="assistant-layout"><div className="assistant-context"><b>بيانات مباشرة</b><span>{assistant?.summary?.totalUsers ?? 0} مستخدم</span><span>{assistant?.summary?.openReports ?? 0} بلاغ مفتوح</span><span>{assistant?.summary?.pendingSubscriptions ?? 0} اشتراك مستني المراجعة</span><small>المساعد بيقترح إجراءات بس، ومش بينفّذها غير لما تأكد. الحذف النهائي يحتاج تأكيدين.</small></div><div className="assistant-main"><div className="assistant-answer">{assistantAnswer ? <><b>رد المساعد</b><p>{assistantAnswer.answer}</p>{assistantAnswer.action && <div className="proposal"><span>إجراء مقترح: {assistantAnswer.action.type === "reply_reports" ? "الرد على البلاغات" : assistantAnswer.action.type === "delete_user" ? `حذف نهائي للحساب #${assistantAnswer.action.userId}` : assistantAnswer.action.suspended ? "إيقاف صاحب ملعب" : "تفعيل صاحب ملعب تاني"}</span><button className="gold-button" onClick={() => void executeAssistantAction()}>أكد ونفّذ</button></div>}</> : <Empty text="اكتب سؤالك، زي: «ورّيني ملخص الاشتراكات المستنية» أو «اقترح متابعة البلاغات»." />}</div><form className="assistant-form" onSubmit={askAssistant}><textarea value={assistantPrompt} onChange={e => setAssistantPrompt(e.target.value)} placeholder="اسأل المساعد عن المستخدمين والحجوزات والبلاغات والاشتراكات…" /><button className="gold-button">حلّل البيانات</button></form></div></div></Panel>}

    {tab === "users" && <Panel
      eyebrow="الأدوار والصلاحيات"
      title="المستخدمين والأدوار"
      action={<div className="filter-row"><input className="filter-search" value={userSearch} onChange={e => setUserSearch(e.target.value)} placeholder="دوّر بالاسم أو الإيميل أو التليفون أو رقم الحساب" />{[["all", "الكل"], ["player", "اللاعبين"], ["owner", "أصحاب الملاعب"], ["moderator", "المشرفين"]].map(([id, label]) => <button className={filter === id ? "selected" : ""} onClick={() => setFilter(id)} key={id}>{label}</button>)}</div>}
    >
      <div className="table-scroll"><table><thead><tr><th>المستخدم</th><th>النوع</th><th>الحالة</th><th>الصلاحيات</th><th>الإجراء</th></tr></thead><tbody>
        {visibleUsers.map(item => {
          const originalRole = item.role === "moderator" ? "moderator" : item.accountType === "owner" ? "owner" : "player";
          const originalPermissions = (item.moderatorPermissions || []).join(",");
          const edit = userEdits[item.id] || { role: originalRole, permissions: originalPermissions };
          const canEditRole = isAdmin && !["admin", "super_admin"].includes(item.role);
          const hasRoleChanges = edit.role !== originalRole || (edit.role === "moderator" && edit.permissions !== originalPermissions);
          const canSuspendUser = can("suspend") && item.role !== "super_admin" && (role === "super_admin" || item.role !== "admin") && (isAdmin || ["player", "owner"].includes(item.role));
          return <tr key={item.id}>
            <td><b>{item.name || "مستخدم"}</b><small>رقم الحساب: <button type="button" className="user-id-copy" onClick={() => void copyUserId(item)}>#{item.id} · نسخ</button> · {item.email || "مفيش إيميل مسجل"}</small>{item.phone && <small>{item.phone}</small>}<small>{item.lastSeenAt && Date.now() - new Date(item.lastSeenAt).getTime() < 120000 ? "متصل دلوقتي" : `آخر ظهور: ${formatDate(item.lastSeenAt)}`}</small>{item.accountType === "owner" && <small>اشتراك الكابتن لحد: {formatDate(item.ownerSubscriptionExpiresAt)} · {subscriptionCountdown(item.ownerSubscriptionExpiresAt)}</small>}</td>
            <td><select value={edit.role} disabled={!canEditRole} onChange={e => setUserEdits(previous => ({ ...previous, [item.id]: { ...edit, role: e.target.value } }))}><option value="player">لاعب</option><option value="owner">صاحب ملعب</option><option value="moderator">مشرف</option></select></td>
            <td><Status value={item.isSuspended ? "suspended" : "active"} /></td>
            <td><PermissionPicker value={edit.permissions} disabled={!canEditRole || edit.role !== "moderator"} onChange={permissions => setUserEdits(previous => ({ ...previous, [item.id]: { ...edit, permissions: permissions.join(",") } }))} /></td>
            <td className="actions">{isAdmin && item.accountType === "player" && item.role === "player" && !item.isSuspended && <button className="outline-button" onClick={() => openPointsForUser(item)}>إهداء نقاط</button>}{canSuspendUser && <button className="outline-button" onClick={() => void changeUserState(item)}>{item.isSuspended ? "تفعيل" : "إيقاف"}</button>}{canEditRole && hasRoleChanges && <button className="quiet-button" onClick={() => void saveUserRole(item)}>حفظ الدور والصلاحيات</button>}{role === "super_admin" && ["player", "owner"].includes(item.accountType) && ["user", "player", "owner"].includes(item.role) && <button className="delete-button" onClick={() => void deleteUserAccount(item)}>حذف نهائي</button>}</td>
          </tr>;
        })}
      </tbody></table></div>
      {!visibleUsers.length && <Empty text="مفيش حسابات في التصنيف ده." />}
    </Panel>}

    {tab === "qrScanner" && <AdminQrScanner verifyBooking={(input) => mutation("bookings.verifyQr", input)} verifyReward={(token) => call("rewards.verify", { token })} confirmReward={(input) => mutation("rewards.confirm", input)} />}
    {tab === "receipts" && <Panel eyebrow="الحجوزات والإيصالات" title="إدارة الحجوزات"><div className="notice-inline">الإدارة تقدر تراجع الحجز وتاخد إجراء، مع تسجيل ملاحظة. رمز QR الأصلي مش بيظهر في اللوحة.</div><div className="record-list">{bookingRows.map(item => <article className="record" key={item.id}><div><b>#{item.id} · {item.playerName || `لاعب #${item.playerId}`} — {item.pitchName || `ملعب #${item.pitchId}`}</b><small>{formatDate(item.startsAt)} · المبلغ {formatMoney(item.paymentAmount ?? item.price)} · طريقة الدفع: {item.paymentMethod || "—"}</small><small>{item.playerEmail || ""} {item.playerPhone ? ` · ${item.playerPhone}` : ""}</small>{item.receiptUrl && <a href={item.receiptUrl} target="_blank" rel="noreferrer">عرض إيصال الدفع</a>}{item.reviewNote && <small>ملاحظة سابقة: {item.reviewNote}</small>}</div><div className="record-side"><Status value={item.status} />{["pending", "approved"].includes(item.status) && <div className="actions">{item.status === "pending" && <><button className="approve-button" onClick={() => void reviewBooking(item, "approved")}>قبول وإصدار QR</button><button className="reject-button" onClick={() => void reviewBooking(item, "rejected")}>رفض</button></>}{<button className="outline-button" onClick={() => void reviewBooking(item, "cancelled")}>إلغاء من الإدارة</button>}</div>}</div></article>)}</div>{!data.bookings.length && <Empty text="مفيش حجوزات مسجلة." />}<input className="wide-input" value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="ملاحظة على الإجراء أو سبب الرفض/الإلغاء (اختياري)" /></Panel>}

    {tab === "qrLogs" && <Panel eyebrow="مراجعة الدخول" title="سجلات QR للحجوزات"><div className="record-list">{data.qrLogs.map(item => <article className="record" key={item.id}><div><b>الحجز #{item.bookingId} · {item.pitchName || "ملعب غير متاح"}</b><small>الحساب #{item.userId} · {item.action === "validated" ? "اتحقق منه" : item.action}</small><small>{formatDate(item.createdAt)}</small></div><span className="tag">الرمز مش ظاهر</span></article>)}</div>{!data.qrLogs.length && <Empty text="لسه مفيش سجلات QR." />}</Panel>}

    {tab === "subscriptions" && <Panel eyebrow="مدفوعات أصحاب الملاعب" title="طلبات الاشتراك"><div className="record-list">{data.subscriptions.map(item => <article className="record" key={item.id}><div><b>طلب اشتراك #{item.id} · الحساب #{item.ownerId}</b><small>الباقة #{item.planId} · {formatDate(item.createdAt)} · Vodafone Cash: {item.vodafoneCashNumber || "—"}</small><small>رقم مرجع الدفع: {item.paymentReference || "—"}</small>{item.receiptUrl && <a href={item.receiptUrl} target="_blank" rel="noreferrer">عرض إيصال الاشتراك</a>}{item.reviewNote && <small>الملاحظة: {item.reviewNote}</small>}</div><div className="record-side"><Status value={item.status} />{item.status === "pending" && <div className="actions"><button className="approve-button" onClick={() => void reviewSubscription(item, "approved")}>قبول وتفعيل</button><button className="reject-button" onClick={() => void reviewSubscription(item, "rejected")}>رفض</button></div>}</div></article>)}</div>{!data.subscriptions.length && <Empty text="مفيش طلبات اشتراك." />}<input className="wide-input" value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="سبب الرفض أو ملاحظة المراجعة (اختياري)" /></Panel>}

    {tab === "venues" && <Panel eyebrow="إدارة الملاعب" title="إدارة الملاعب"><div className="notice-inline">هنا هتلاقي الملاعب الجديدة والمنشورة والموقوفة. كل بطاقة فيها بيانات الملعب والمالك والكابتن والأسعار والدفع والملاعب الفرعية عشان تراجعها قبل القرار.</div><div className="record-list">{data.venues.map(item => { const pitch = item.pitch || item; const fields = itemsOf(item.fields); const amenities = Array.isArray(pitch.amenities) ? pitch.amenities.map(String).join("، ") : typeof pitch.amenities === "string" ? pitch.amenities : pitch.amenities ? JSON.stringify(pitch.amenities) : ""; return <article className="record venue-record" key={pitch.id}><div className="venue-review-details"><b>{pitch.name} · طلب رقم {pitch.id} · حساب المالك رقم {pitch.ownerId}</b><small>المالك: {item.ownerName || "مش مسجل"} · الإيميل: {item.ownerEmail || "—"} · التليفون: {item.ownerPhone || "—"}</small><small>العنوان: {pitch.address || "—"} · {pitch.city || "—"}{pitch.latitude != null || pitch.longitude != null ? ` · الإحداثيات: ${pitch.latitude ?? "—"}, ${pitch.longitude ?? "—"}` : ""}</small><small>الكابتن الأساسي: {pitch.captainName || "—"} · تليفون الكابتن: {pitch.captainPhone || "—"}</small><small>عدد الملاعب الفرعية: {pitch.subPitchCount ?? "—"} · سعر الصبح: {formatMoney(pitch.morningPrice)} · سعر بالليل: {formatMoney(pitch.eveningPrice)}</small><small>الحجز والدفع: {pitch.bookingPaymentMode === "deposit" ? `عربون ${formatMoney(pitch.depositAmount)}` : "الدفع عند الوصول"} · Vodafone Cash: {pitch.vodafoneCashNumber || "—"}</small>{pitch.description && <small>الوصف: {pitch.description}</small>}{amenities && <small>المرافق والمميزات: {amenities}</small>}<small>الحالة: {statusText(pitch.status)} · تاريخ الإرسال: {formatDate(pitch.createdAt)} · آخر تحديث: {formatDate(pitch.updatedAt)}</small><div className="venue-review-links">{pitch.mapUrl && <a href={pitch.mapUrl} target="_blank" rel="noreferrer">افتح موقع الملعب</a>}{pitch.imageUrl && <a href={pitch.imageUrl} target="_blank" rel="noreferrer">عرض صورة الملعب</a>}</div>{fields.length > 0 && <details className="venue-subpitch-details" open><summary>تفاصيل الملاعب الفرعية ({fields.length})</summary>{fields.map((field: AnyRecord) => <small key={field.id}>{field.name} · {field.sport || "رياضة مش محددة"} · السعة {field.capacity} · {formatMoney(field.hourlyPrice)} في الساعة · {field.isActive ? "شغال" : "موقوف"}</small>)}</details>}</div><div className="actions">{["pending", "draft"].includes(pitch.status) && <button className="approve-button" onClick={() => void reviewPitch(pitch, "approve")}>الموافقة والنشر</button>}{pitch.status === "published" ? <button className="reject-button" onClick={() => void updatePitchStatus(pitch, "suspended")}>إيقاف</button> : <button className="approve-button" onClick={() => void updatePitchStatus(pitch, "published")}>نشر/إعادة نشر</button>}{pitch.status !== "rejected" && <button className="outline-button" onClick={() => void updatePitchStatus(pitch, "rejected")}>رفض</button>}</div></article>; })}</div>{!data.venues.length && <Empty text="مفيش ملاعب مسجلة." />}<input className="wide-input" value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="سبب تغيير الحالة (اختياري)" /></Panel>}

    {tab === "suggestions" && <Panel eyebrow="اقتراحات المجتمع" title="اقتراحات الملاعب"><div className="record-list">{data.suggestions.map(item => <article className="record" key={item.id}><div><b>{item.name} · حساب #{item.userId}</b><small>{item.address} · {item.city} · {statusText(item.status)}</small>{item.notes && <small>{item.notes}</small>}</div>{item.status === "pending" ? <div className="actions"><button className="approve-button" onClick={() => void reviewSuggestion(item, "accepted")}>قبول</button><button className="reject-button" onClick={() => void reviewSuggestion(item, "rejected")}>رفض</button></div> : <Status value={item.status} />}</article>)}</div>{!data.suggestions.length && <Empty text="مفيش اقتراحات جديدة." />}</Panel>}

    {tab === "reports" && <Panel eyebrow="الأمان ومتابعة البلاغات" title="البلاغات والشكاوى"><div className="record-list">{data.reports.map(item => <article className="record" key={item.id}><div><b>بلاغ #{item.id} · {item.targetType || "بلاغ عن مستخدم"} #{item.targetId || "—"}</b><small>المبلّغ #{item.reporterId} · السبب: {item.reason || "—"}</small><small>{item.details || "مفيش تفاصيل"}</small><Status value={item.status} /></div>{["open", "reviewing"].includes(item.status) && <div className="actions"><button className="outline-button" onClick={() => void reviewReport(item, "reviewing")}>اتراجع</button><button className="approve-button" onClick={() => void reviewReport(item, "resolved")}>حل البلاغ</button><button className="reject-button" onClick={() => void reviewReport(item, "dismissed")}>قفل البلاغ</button></div>}</article>)}</div>{!data.reports.length && <Empty text="مفيش بلاغات مفتوحة." />}<input className="wide-input" value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="سبب الحل أو القفل" /></Panel>}

    {tab === "rewards" && <RewardsPanel rewards={data.rewards} vouchers={data.vouchers} points={data.points} pitchTargets={data.pitchTargets} users={data.users} selectedUser={rewardTarget} onTargetConsumed={() => setRewardTarget(null)} canCancel={isAdmin} onRefresh={() => void loadTab("rewards")} onNotice={setNotice} />}

    {tab === "referrals" && can("referrals") && <ReferralAdminPanel data={referralData} isAdmin={isAdmin} onRefresh={() => void loadTab("referrals")} onNotice={setNotice} />}

    {tab === "settings" && <div className="feature-grid"><Panel eyebrow="تحكم سريع" title="اشتراكات أصحاب الملاعب"><label className="switch-row subscription-control-row"><span><b>{subscriptionRequired ? "الدفع والاشتراكات شغالة" : "التسجيل المجاني شغال"}</b><small>{subscriptionRequired ? "الكابتن يختار باقة، يحوّل Vodafone Cash، ويرفع صورة الإيصال." : "الكابتن يسجّل ملعبه ويدخل اللوحة من غير دفع أو صورة إيصال."}</small></span><input type="checkbox" checked={subscriptionRequired} onChange={() => void toggleOwnerSubscriptions()} /></label><div className="subscription-mode-badge">الوضع الحالي: <strong>{subscriptionRequired ? "ON — دفع الاشتراك" : "OFF — تجربة مجانية"}</strong></div></Panel><Panel eyebrow="عرض التسجيل الجديد" title="اشتراك مجاني للكباتن الجدد"><form className="stack-form" onSubmit={saveGlobalFreeTrial}><label className="switch-row subscription-control-row"><span><b>{freeTrialEnabled ? "العرض المجاني ظاهر" : "العرض المجاني مخفي"}</b><small>يظهر في صفحة تسجيل صاحب الملعب الجديدة.</small></span><input type="checkbox" checked={freeTrialEnabled} onChange={e => setFreeTrialEnabled(e.target.checked)} /></label><label>مدة الاشتراك المجاني<input type="number" min="1" max="3650" value={freeTrialDays} onChange={e => setFreeTrialDays(e.target.value)} required /><small>كل كابتن جديد يسجّل أثناء تشغيل العرض يأخذ المدة دي مرة واحدة.</small></label><button className="gold-button" type="submit">حفظ عرض التسجيل</button></form></Panel><Panel eyebrow="تجربة مخصصة" title="فعّل اشتراك مجاني لكابتن"><p className="muted">اختار كابتن، اكتب مدة التجربة بالأيام، واضغط تفعيل. لو عنده مدة شغالة، المدة الجديدة هتتضاف بعدها مش هتضيع.</p><form className="stack-form" onSubmit={grantFreeTrial}><label>الكابتن<select value={freeTrialForm.userId} onChange={e => setFreeTrialForm({ ...freeTrialForm, userId: e.target.value })} required><option value="">اختار صاحب الملعب</option>{data.users.filter((item: AnyRecord) => item.accountType === "owner" || item.role === "owner").map((item: AnyRecord) => <option key={item.id} value={item.id}>{item.name || "كابتن من غير اسم"} · #{item.id}{item.email ? ` · ${item.email}` : ""}</option>)}</select></label><label>مدة التجربة المجانية<input type="number" min="1" max="3650" value={freeTrialForm.durationDays} onChange={e => setFreeTrialForm({ ...freeTrialForm, durationDays: e.target.value })} required /><small>بعد انتهاء المدة يرجع النظام يطلب تجديدًا إذا كان وضع الاشتراك ON.</small></label><button className="gold-button" type="submit">فعّل التجربة المجانية</button></form></Panel><Panel eyebrow="الباقات" title="إدارة باقات الملاعب"><form className="form-grid" onSubmit={addPlan}><input placeholder="اسم الباقة" value={planForm.name} onChange={e => setPlanForm({ ...planForm, name: e.target.value })} required /><input type="number" min="0" placeholder="السعر بالجنيه" value={planForm.price} onChange={e => setPlanForm({ ...planForm, price: e.target.value })} required /><input type="number" min="1" placeholder="المدة بالأيام" value={planForm.durationDays} onChange={e => setPlanForm({ ...planForm, durationDays: e.target.value })} required /><label className="file-label"><span>صورة الباقة (اختياري)</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setPlanImageFile(e.target.files?.[0] || null)} /><small>{planImageFile?.name || "من غير صورة — هتتختار صورة مميزة تلقائي"}</small></label><button className="gold-button">إضافة الباقة</button></form><div className="record-list compact-list">{data.plans.map(plan => <article className="record" key={plan.id}><div>{plan.imageUrl && <img className="plan-admin-thumb" src={plan.imageUrl} alt="" />}<b>{plan.name}</b><small>{formatMoney(plan.price)} · {plan.durationDays} يوم · {plan.isActive ? "شغالة" : "موقوفة"}</small></div><div className="actions"><button className="quiet-button" onClick={() => void editPlan(plan)}>تعديل</button>{plan.isActive ? <button className="reject-button" onClick={() => void act("admin.updatePlan", { id: Number(plan.id), isActive: false }, "الباقة اتوقفت.", "settings")}>إيقاف</button> : <button className="approve-button" onClick={() => void act("admin.updatePlan", { id: Number(plan.id), isActive: true }, "الباقة اتفعّلت تاني.", "settings")}>إعادة تفعيل</button>}</div></article>)}</div></Panel><Panel eyebrow="أمان الدفع" title="التحقق الذكي من الإيصالات"><label className="switch-row"><span><b>{smartReceipt ? "الفحص التلقائي شغال" : "المراجعة اليدوية شغالة"}</b><small>{smartReceipt ? "مطابقة المبلغ ورقم المحفظة قبل التفعيل." : "الإيصالات بتروح للمراجعة اليدوية."}</small></span><input type="checkbox" checked={smartReceipt} onChange={() => void toggleSmart()} /></label></Panel><Panel eyebrow="إعدادات التحويل" title="Vodafone Cash"><form onSubmit={saveCash} className="stack-form"><label>رقم Vodafone Cash<input value={cashNumber} onChange={e => setCashNumber(e.target.value)} placeholder="01X XXXX XXXX" /></label><button className="gold-button">حفظ الرقم</button></form></Panel><Panel eyebrow="الأمان" title="بيانات الدخول المحمية"><p className="muted">مفاتيح SMTP وManus بتتخزن في مكان آمن ومش بتظهر في اللوحة أو المتصفح.</p></Panel></div>}

    {tab === "download" && <div className="feature-grid"><Panel eyebrow="إدارة إصدارات التطبيق" title="إعدادات APK وWindows"><form onSubmit={saveDownload} className="stack-form"><label>اسم التطبيق<input value={downloadConfig.appName || ""} onChange={e => setDownloadConfig({ ...downloadConfig, appName: e.target.value })} /></label><div className="form-grid"><label>الإصدار<input value={downloadConfig.version || ""} onChange={e => setDownloadConfig({ ...downloadConfig, version: e.target.value })} /></label><label>اسم ملف Windows<input value={downloadConfig.windowsFileName || ""} onChange={e => setDownloadConfig({ ...downloadConfig, windowsFileName: e.target.value })} /></label></div><label>رابط Windows المباشر<input value={downloadConfig.windowsUrl || ""} onChange={e => setDownloadConfig({ ...downloadConfig, windowsUrl: e.target.value })} placeholder="https:// أو /manus-storage/..." /></label><label>رابط APK الخارجي عند استخدام URL<input value={downloadConfig.url || ""} onChange={e => setDownloadConfig({ ...downloadConfig, mode: "url", url: e.target.value })} placeholder="https://..." /></label><label className="file-label">ارفع APK جديد (اختياري)<input type="file" accept=".apk,application/vnd.android.package-archive" onChange={e => setApkFile(e.target.files?.[0] || null)} /><small>{apkFile?.name || downloadConfig.fileKey || "مفيش ملف متحدد"}</small></label><label>أرقام واتساب الدعم<input value={Array.isArray(downloadConfig.supportNumbers) ? downloadConfig.supportNumbers.join(", ") : downloadConfig.supportNumbers || ""} onChange={e => setDownloadConfig({ ...downloadConfig, supportNumbers: e.target.value })} /></label><button className="gold-button">حفظ إصدار التنزيل</button></form><div className="download-links"><a href={`${API_ORIGIN}/api/download/android?v=${encodeURIComponent(downloadConfig.version || "")}`} target="_blank" rel="noreferrer">جرّب تنزيل APK · {downloadConfig.version || "الإصدار الحالي"}</a><a href={`${API_ORIGIN}/api/download/windows?v=${encodeURIComponent(downloadConfig.version || "")}`} target="_blank" rel="noreferrer">جرّب تنزيل Windows · {downloadConfig.version || "الإصدار الحالي"}</a><a href="/download" target="_blank" rel="noreferrer">افتح صفحة التنزيل العامة · {downloadConfig.version || "الإصدار الحالي"}</a></div></Panel><Panel eyebrow="إحصائيات التنزيل" title="إحصائيات التنزيل"><div className="stats-grid small-stats"><article><small>كل الطلبات</small><strong>{downloadStats.total ?? 0}</strong></article><article><small>Android</small><strong>{downloadStats.android ?? 0}</strong></article><article><small>Windows</small><strong>{downloadStats.windows ?? 0}</strong></article><article><small>آخر 30 يوم</small><strong>{downloadStats.last30Days ?? 0}</strong></article></div><DownloadTrendChart data={downloadStats.daily} /><div className="analytics-lines"><b>الأجهزة</b>{(downloadStats.devices || []).slice(0, 6).map((item: AnyRecord) => <span key={item.name}>{item.name}: {item.total}</span>)}<b>أنظمة التشغيل</b>{(downloadStats.operatingSystems || []).slice(0, 6).map((item: AnyRecord) => <span key={item.name}>{item.name}: {item.total}</span>)}</div></Panel></div>}

    {tab === "admins" && <section className="panel"><div className="panel-head"><div><span className="overline">إدارة الصلاحيات</span><h3>حسابات المشرفين</h3></div><span className="count-badge">{admins.length} حساب</span></div><div className="admin-layout"><div className="table-wrap"><table><thead><tr><th>المشرف</th><th>الدور</th><th>الصلاحيات</th><th>آخر دخول</th><th>الحالة</th><th /></tr></thead><tbody>{admins.map(admin => { const edit = userEdits[admin.id] || { role: admin.role, permissions: (admin.moderatorPermissions || []).join(",") }; return <tr key={admin.id}><td><b>{admin.name || "من غير اسم"}</b><small>{admin.email}</small></td><td><select value={edit.role} disabled={admin.role === "super_admin"} onChange={e => setUserEdits(previous => ({ ...previous, [admin.id]: { ...edit, role: e.target.value } }))}><option value="moderator">مشرف</option><option value="admin">مدير</option></select></td><td><PermissionPicker value={edit.permissions} disabled={admin.role === "super_admin"} onChange={permissions => setUserEdits(previous => ({ ...previous, [admin.id]: { ...edit, permissions: permissions.join(",") } }))} /></td><td>{formatDate(admin.lastSignedIn)}</td><td><span className={admin.isSuspended ? "status off" : "status"}>{admin.isSuspended ? "موقوف" : "شغال"}</span></td><td className="actions">{admin.role !== "super_admin" && <><button className="quiet-button" onClick={() => void saveAdminEdit(admin)}>حفظ</button><button className="outline-button" onClick={() => void changeAdminState(admin)}>{admin.isSuspended ? "تفعيل" : "إيقاف"}</button><button className="danger-link" onClick={() => void removeAdmin(admin)}>إزالة</button></>}</td></tr>; })}</tbody></table></div><AdminProvisionForm onCreate={createAdmin} onLinkExisting={linkExistingAdmin} /></div></section>}

    {tab === "audit" && <Panel eyebrow="سجل موثق" title="سجل نشاط الإدارة"><div className="audit-list">{audit.map(item => <article key={item.id}><span className="audit-dot" /><div><b>{item.action}</b><small>{item.actorName || item.actorEmail || `مشرف #${item.actorId}`} · {item.targetType || "النظام"}{item.targetId ? ` #${item.targetId}` : ""}</small></div><time>{formatDate(item.createdAt)}</time></article>)}</div>{!audit.length && <Empty />}</Panel>}

    {tab === "customerActivity" && <Panel eyebrow="نشاط العملاء" title="سجل نشاط العملاء"><div className="table-scroll"><table><thead><tr><th>العميل</th><th>النشاط</th><th>المسار</th><th>آخر ظهور</th><th>وقت التسجيل</th></tr></thead><tbody>{data.customerActivity.map(item => <tr key={item.id}><td><b>{item.userName || `عميل #${item.userId}`}</b><small>{item.userEmail || "—"} · {item.accountType === "owner" ? "كابتن" : roleLabel(item.userRole)}</small></td><td><span className="tag">{item.action === "active" ? "تصفح ونشاط" : item.action}</span></td><td><code>{item.path || "/"}</code></td><td><span className={item.lastSeenAt && Date.now() - new Date(item.lastSeenAt).getTime() < 120000 ? "status" : "status off"}>{item.lastSeenAt && Date.now() - new Date(item.lastSeenAt).getTime() < 120000 ? "متصل دلوقتي" : formatDate(item.lastSeenAt)}</span></td><td>{formatDate(item.createdAt)}</td></tr>)}</tbody></table></div>{!data.customerActivity.length && <Empty text="لسه مفيش نشاط متسجل للعملاء." />}</Panel>}

    {tab === "support" && <section className="support-layout panel" dir="rtl">
      <aside className="support-inbox"><div className="support-inbox-head"><div><span className="overline">خدمة العملاء</span><h3>المحادثات</h3></div><span className="count-badge">{supportRooms.length}</span></div>
        <div className="support-filters">{[["all","الكل"],["open","مفتوحة"],["pending","مستنية"],["resolved","اتحلت"],["closed","مقفولة"]].map(([id,label])=><button key={id} className={supportFilter===id?"selected":""} onClick={()=>setSupportFilter(id)}>{label}</button>)}</div>
        <div className="support-room-list">{supportRooms.filter(room=>supportFilter==="all"?true:room.status===supportFilter).map(room=><button key={room.roomId} className={`support-room ${supportRoomId===room.roomId?"active":""}`} onClick={()=>selectSupportRoom(room.roomId)}><span className="support-avatar">{room.requester?.avatarUrl?<img src={room.requester.avatarUrl} alt=""/>:(room.requester?.name||"م").slice(0,1)}</span><span className="support-room-copy"><b>{room.requester?.name||`مستخدم #${room.requesterId}`}</b><small>{room.subject||room.category||"طلب مساعدة"} · <Status value={room.status}/></small><small className="support-last-message">{room.lastMessage||"لسه مفيش رسايل"}</small></span><time>{formatDate(room.updatedAt)}</time></button>)}{!supportRooms.length&&<Empty text="لا توجد محادثات دعم حالياً."/>}</div>
      </aside><div className="support-conversation">{supportRoomId?(()=>{const room=supportRooms.find(item=>item.roomId===supportRoomId); return <><header className="support-conversation-head"><div><span className="overline">طلب رقم {supportRoomId} · {room?.category||"دعم"}</span><h3>{room?.subject||room?.requester?.name||"محادثة الدعم"}</h3><small>{room?.requester?.email||""} {room?.requester?.phone?`· ${room.requester.phone}`:""} · الأولوية {room?.priority||"عادية"}</small></div><div className="actions"><Status value={room?.status}/><button className="outline-button" disabled={supportProfileBusy} onClick={()=>void showSupportProfile()}><UserRound size={14}/>{supportProfileBusy?"بيتحمل…":"بيانات المستخدم"}</button>{["resolved","closed"].includes(room?.status)?<button className="approve-button" disabled={supportBusy} onClick={()=>void setSupportRoomStatus("open")}>فتح تاني</button>:<button className="approve-button" disabled={supportBusy} onClick={()=>void setSupportRoomStatus("resolved")}>{supportBusy?"بيتحدّث…":"حل المحادثة"}</button>}</div></header>
       {supportProfile&&<div className="support-profile"><button className="text-button" onClick={()=>setSupportProfile(null)}>قفل ×</button><b>{supportProfile.user?.name||"مستخدم"} · #{supportProfile.user?.id}</b><small>{supportProfile.user?.email||"—"} · {supportProfile.user?.phone||"—"}</small><small>{roleLabel(supportProfile.user?.role)} · {accountTypeLabel(supportProfile.user?.accountType)} · انضم: {formatDate(supportProfile.user?.createdAt)}{supportProfile.user?.isSuspended?" · موقوف":""}</small><strong>سجل الحجوزات ({supportProfile.bookings?.length||0})</strong>{supportProfile.bookings?.length?supportProfile.bookings.map((booking:AnyRecord)=><small key={booking.id}>#{booking.id} · {booking.pitchName||"ملعب"} · {statusText(booking.status)} · {formatDate(booking.startsAt)} · {formatMoney(booking.paymentAmount)}</small>):<small>مفيش حجوزات مسجلة.</small>}</div>}
        {supportProfile&&<div className="support-profile support-profile-history"><strong>الملاعب ({supportProfile.pitches?.length||0})</strong>{supportProfile.pitches?.length?supportProfile.pitches.map((pitch:AnyRecord)=><small key={pitch.id}>#{pitch.id} · {pitch.name} · {pitch.city} · {statusText(pitch.status)}</small>):<small>الحساب ده ملوش ملاعب.</small>}<strong>طلبات الاشتراك ({supportProfile.subscriptions?.length||0})</strong>{supportProfile.subscriptions?.length?supportProfile.subscriptions.map((subscription:AnyRecord)=><small key={subscription.id}>#{subscription.id} · {subscription.planName} · {statusText(subscription.status)} · {formatDate(subscription.createdAt)}{subscription.reviewNote?` · ${subscription.reviewNote}`:""}</small>):<small>مفيش طلبات اشتراك مسجلة.</small>}</div>}
        <div className="support-messages">{supportMessagesLoading?<Empty text="بنحمّل رسايل المحادثة…"/>:supportMessages.map(message=><article className={message.senderId===user.id?"mine":""} key={message.id}><b>{message.senderName||`مستخدم #${message.senderId}`}</b>{message.body&&<p>{message.body}</p>}{message.messageType&&message.messageType!=="text"&&<button className="support-media-button" disabled={supportMediaBusy===message.id} onClick={()=>void openSupportMedia(message)}><Paperclip size={14}/>{supportMediaBusy===message.id?"بنجهّز المرفق…":/image/.test(message.mediaMimeType||"")?"عرض الصورة":/audio/.test(message.mediaMimeType||"")?`تشغيل الصوت${message.durationSeconds ? ` · ${message.durationSeconds}ث` : ""}`:/video/.test(message.mediaMimeType||"")?"عرض الفيديو":"تنزيل المرفق"}<ExternalLink size={12}/></button>}<small>{formatDate(message.createdAt)}{message.deliveryState==="pending"?" · بيتبعت…":""}</small></article>)}{!supportMessagesLoading&&!supportMessages.length&&<Empty text="مفيش رسايل في المحادثة دي."/>}</div>
        <form className="support-composer" onSubmit={sendSupportReply}><textarea value={supportDraft} onChange={e=>setSupportDraft(e.target.value)} placeholder="اكتب رد فريق الدعم…" disabled={supportBusy} rows={2}/><label className="support-attachment"><Paperclip size={16}/><span>{supportFile?.name||"إرفاق ملف"}</span><input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,audio/webm,audio/ogg,audio/mp4,audio/mpeg,audio/wav,application/pdf,application/zip,application/octet-stream,text/plain,text/csv,.docx,.xlsx,.pptx" disabled={supportBusy} onChange={e=>setSupportFile(e.target.files?.[0]||null)}/></label>{supportFile&&<button type="button" className="text-button" onClick={()=>setSupportFile(null)} disabled={supportBusy}>شيل المرفق</button>}<button className="gold-button" disabled={supportBusy||(!supportDraft.trim()&&!supportFile)}>{supportBusy?"بيبعت…":"إرسال الرد"}</button></form></>;})():<div className="empty-chat"><LifeBuoy size={36}/><h3>اختار محادثة دعم</h3><p>الرسايل والتفاصيل هتظهر هنا.</p></div>}</div>
    </section>}
  </main></div>;
}

function App() {
  const [user, setUser] = useState<AnyRecord | null>(null);
  useEffect(() => { document.title = "البرازيلي — لوحة الإدارة"; }, []);
  const logout = async () => { await mutation("auth.logout").catch(() => undefined); setUser(null); };
  return user ? <Dashboard user={user} onLogout={logout} /> : <Login onDone={setUser} />;
}

createRoot(document.getElementById("root")!).render(<App />);
