import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import AdminProvisionForm, { type CreateAdminInput, type LinkAdminInput } from "./AdminProvisionForm";
import { permissionList, permissionOptions } from "./permissions";
import DownloadTrendChart from "./DownloadTrendChart";
import AdminActivityChart from "./AdminActivityChart";
import type { LucideIcon } from "lucide-react";
import { Activity, Bot, CalendarDays, ClipboardList, CreditCard, Download, Flag, Gift, LayoutDashboard, MapPin, MessageCircle, QrCode, Settings, ShieldCheck, Users } from "lucide-react";

type AnyRecord = Record<string, any>;
type TabId = "overview" | "assistant" | "users" | "customerActivity" | "receipts" | "qrLogs" | "subscriptions" | "chats" | "venues" | "suggestions" | "reports" | "rewards" | "settings" | "download" | "admins" | "audit" | "chat";
const tabIcons: Record<TabId, LucideIcon> = { overview: LayoutDashboard, assistant: Bot, users: Users, customerActivity: Activity, receipts: ClipboardList, qrLogs: QrCode, subscriptions: CreditCard, chats: MessageCircle, venues: MapPin, suggestions: Flag, reports: Flag, rewards: Gift, settings: Settings, download: Download, admins: ShieldCheck, audit: Activity, chat: MessageCircle };
const tabGroupDefinitions: Array<[string, TabId[]]> = [
  ["مركز القيادة", ["overview", "assistant", "audit", "customerActivity"]],
  ["اللاعبون والحجوزات", ["users", "receipts", "qrLogs", "subscriptions", "chats", "reports", "rewards"]],
  ["الملاعب", ["venues", "suggestions"]],
  ["الإعدادات والموارد", ["settings", "download", "admins", "chat"]],
];

const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN || window.location.origin).replace(/\/$/, "");
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
  if (!response.ok || data?.error) throw new Error(data?.error?.json?.message || data?.error?.message || "تعذر تنفيذ العملية");
  return data?.result?.data?.json ?? data?.result?.data;
};
const mutation = (path: string, input?: unknown) => call(path, input, "POST");
const itemsOf = (value: any): AnyRecord[] => Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : [];
const formatDate = (value: unknown) => value ? new Date(String(value)).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" }) : "—";
const formatMoney = (value: unknown) => value == null || value === "" ? "—" : `${Number(value).toLocaleString("ar-EG")} ج.م`;
const statusLabel: Record<string, string> = { pending: "قيد الانتظار", approved: "مقبول", rejected: "مرفوض", open: "مفتوح", reviewing: "قيد المراجعة", resolved: "تم الحل", dismissed: "مغلق", accepted: "مقبول", reviewed: "تمت المراجعة", published: "منشور", draft: "مسودة" };
const statusText = (value: unknown) => statusLabel[String(value)] || String(value || "—");
const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("تعذر قراءة الملف")); reader.readAsDataURL(file); });

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
      setError(e.message || "بيانات الدخول غير صحيحة");
    }
    finally { setBusy(false); }
  };
  return <main className="login-shell"><div className="login-orbit" /><section className="login-card"><div className="brand-mark login-logo"><img src="/brzly-logo.svg" alt="" /></div><span className="overline">لوحة تحكم المشرفين</span><h1>غرفة العمليات<br /><em>للقرارات الكبيرة.</em></h1><p className="muted">دخول الإدارة عبر البريد الإلكتروني وكلمة المرور.</p><form onSubmit={submit}>
    <label>البريد الإلكتروني<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="اكتب بريد المشرف" autoComplete="email" required /></label>
    <label>كلمة المرور<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required minLength={8} /></label>
    {error && <div className="error-box">{error}</div>}<button className="gold-button" disabled={busy}>{busy ? "جارٍ التحقق…" : "تسجيل الدخول"}</button>
  </form><small className="security-note">جلسة المشرف تُراجع صلاحيتها على الخادم قبل كل إجراء.</small></section></main>;
}

function Panel({ eyebrow, title, action, children, className = "" }: { eyebrow?: string; title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={`panel ${className}`}><div className="panel-head"><div>{eyebrow && <span className="overline">{eyebrow}</span>}<h3>{title}</h3></div>{action}</div>{children}</section>;
}
function Empty({ text = "لا توجد بيانات حالياً." }: { text?: string }) { return <div className="empty-state">{text}</div>; }
function Status({ value }: { value: unknown }) { return <span className={`status ${["rejected", "dismissed"].includes(String(value)) ? "off" : ""}`}>{statusText(value)}</span>; }
function PermissionPicker({ value, disabled, onChange }: { value: unknown; disabled?: boolean; onChange: (permissions: string[]) => void }) {
  const selected = permissionList(value);
  return <div className="permission-picker">{permissionOptions.map(([id, label]) => <label key={id}><input type="checkbox" checked={selected.includes(id)} disabled={disabled} onChange={() => onChange(selected.includes(id) ? selected.filter(item => item !== id) : [...selected, id])} />{label}</label>)}</div>;
}

function RewardsPanel({ rewards, vouchers, points, canCancel, onRefresh, onNotice }: { rewards: AnyRecord[]; vouchers: AnyRecord[]; points: AnyRecord[]; canCancel: boolean; onRefresh: () => void; onNotice: (message: string) => void }) {
  const [form, setForm] = useState({ name: "", description: "", rewardType: "free_booking", costPoints: "", terms: "", expiresInDays: "", authorizedType: "admin", authorizedPitchId: "" });
  const [pointsForm, setPointsForm] = useState({ userId: "", amount: "", note: "" });
  const [busy, setBusy] = useState(false);
  const create = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true);
    try {
      await mutation("adminPortal.rewards.create", { ...form, costPoints: Number(form.costPoints), expiresInDays: form.expiresInDays ? Number(form.expiresInDays) : null, authorizedPitchId: form.authorizedPitchId ? Number(form.authorizedPitchId) : null });
      onNotice("تمت إضافة المكافأة إلى الكتالوج."); setForm({ name: "", description: "", rewardType: "free_booking", costPoints: "", terms: "", expiresInDays: "", authorizedType: "admin", authorizedPitchId: "" }); onRefresh();
    } catch (e: any) { onNotice(e.message); } finally { setBusy(false); }
  };
  const adjustPoints = async (event: React.FormEvent) => { event.preventDefault(); try { await mutation("adminPortal.rewards.adjustPoints", { userId: Number(pointsForm.userId), amount: Number(pointsForm.amount), note: pointsForm.note.trim() }); onNotice("تم تحديث رصيد اللاعب وتسجيل الحركة."); setPointsForm({ userId: "", amount: "", note: "" }); onRefresh(); } catch (e: any) { onNotice(e.message); } };
  const cancel = async (item: AnyRecord) => { const reason = window.prompt("سبب إلغاء القسيمة؟", "إيقاف إداري"); if (!reason) return; try { await mutation("adminPortal.vouchers.cancel", { id: Number(item.id), reason }); onNotice("تم إلغاء القسيمة ولن يمكن استخدامها."); onRefresh(); } catch (e: any) { onNotice(e.message); } };
  return <div className="feature-grid">
    <Panel eyebrow="PLAYER POINTS" title="إدارة أرصدة اللاعبين"><form className="form-grid" onSubmit={adjustPoints}><input type="number" min="1" placeholder="رقم اللاعب User ID" value={pointsForm.userId} onChange={e => setPointsForm({ ...pointsForm, userId: e.target.value })} required /><input type="number" placeholder="عدد النقاط (+ إضافة / − خصم)" value={pointsForm.amount} onChange={e => setPointsForm({ ...pointsForm, amount: e.target.value })} required /><input placeholder="سبب الحركة" value={pointsForm.note} onChange={e => setPointsForm({ ...pointsForm, note: e.target.value })} required /><button className="gold-button" disabled={!canCancel}>تسجيل النقاط</button></form><div className="record-list compact-list">{points.map(item => <article className="record" key={item.id}><div><b>{item.playerName} · #{item.userId}</b><small>{item.playerEmail}</small></div><strong>{Number(item.balance || 0).toLocaleString("ar-EG")} نقطة</strong></article>)}{!points.length && <Empty text="لا توجد أرصدة مسجلة بعد. أضف نقاطاً للاعب من النموذج أعلاه." />}</div></Panel>
    <Panel eyebrow="REWARD CATALOG" title={canCancel ? "إضافة مكافأة جديدة" : "كتالوج المكافآت (قراءة فقط)"}>{canCancel && <form className="form-grid" onSubmit={create}><input placeholder="اسم المكافأة" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /><select value={form.rewardType} onChange={e => setForm({ ...form, rewardType: e.target.value })}><option value="free_booking">حجز ملعب مجاني</option><option value="product_delivery">منتج / توصيل</option><option value="discount">خصم</option><option value="other">أخرى</option></select><input type="number" min="1" placeholder="تكلفة النقاط" value={form.costPoints} onChange={e => setForm({ ...form, costPoints: e.target.value })} required /><input type="number" min="1" placeholder="الصلاحية بالأيام (اختياري)" value={form.expiresInDays} onChange={e => setForm({ ...form, expiresInDays: e.target.value })} /><textarea placeholder="الوصف وشروط الاستخدام" value={form.terms} onChange={e => setForm({ ...form, terms: e.target.value })} /><select value={form.authorizedType} onChange={e => setForm({ ...form, authorizedType: e.target.value })}><option value="admin">الإدارة</option><option value="pitch_owner">صاحب الملعب</option><option value="rewards_staff">موظف المكافآت</option></select>{form.authorizedType === "pitch_owner" && <input type="number" min="1" placeholder="ID الملعب المصرح" value={form.authorizedPitchId} onChange={e => setForm({ ...form, authorizedPitchId: e.target.value })} required />}<button className="gold-button" disabled={busy}>{busy ? "جارٍ الحفظ…" : "إضافة المكافأة"}</button></form>}<div className="record-list compact-list">{rewards.map(item => <article className="record" key={item.id}><div><b>{item.name}</b><small>{item.costPoints} نقطة · {item.rewardType} · {item.isActive ? "نشطة" : "موقوفة"}</small><small>{item.terms || item.description || "بدون شروط إضافية"}</small></div></article>)}{!rewards.length && <Empty text="لم تتم إضافة مكافآت بعد." />}</div></Panel>
    <Panel eyebrow="SECURE VOUCHERS" title="سجل القسائم والاسترداد"><div className="record-list">{vouchers.map(item => <article className="record" key={item.id}><div><b>#{item.id} · {item.rewardNameSnapshot}</b><small>{item.playerName || item.playerEmail || `لاعب #${item.userId}`} · {item.pointsCost} نقطة</small><small>الإصدار: {formatDate(item.issuedAt)} · الانتهاء: {formatDate(item.expiresAt)}</small><small>{item.usedByName ? `استُخدمت بواسطة ${item.usedByName} في ${formatDate(item.usedAt)}` : "لم تُستخدم بعد"}</small></div><div className="record-side"><Status value={item.status} />{canCancel && item.status === "valid" && <button className="reject-button" onClick={() => void cancel(item)}>إلغاء القسيمة</button>}</div></article>)}{!vouchers.length && <Empty text="لا توجد قسائم صادرة حتى الآن." />}</div></Panel>
  </div>;
}

function Dashboard({ user, onLogout }: { user: AnyRecord; onLogout: () => void }) {
  const role = String(user.role || "");
  const isAdmin = role === "admin" || role === "super_admin";
  const permissions: string[] = Array.isArray(user.moderatorPermissions) ? user.moderatorPermissions : [];
  const can = (scope: string) => isAdmin || permissions.includes(scope);
  const [tab, setTab] = useState<TabId>("overview");
  const [overview, setOverview] = useState<AnyRecord>({});
  const [data, setData] = useState<Record<string, AnyRecord[]>>({ users: [], customerActivity: [], bookings: [], qrLogs: [], subscriptions: [], chats: [], venues: [], suggestions: [], reports: [], plans: [], rewards: [], vouchers: [], points: [] });
  const [admins, setAdmins] = useState<AnyRecord[]>([]);
  const [audit, setAudit] = useState<AnyRecord[]>([]);
  const [rooms, setRooms] = useState<AnyRecord[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<number | null>(null);
  const [messages, setMessages] = useState<AnyRecord[]>([]);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [memberIds, setMemberIds] = useState("");
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState("all");
  const [rejectReason, setRejectReason] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [cashNumber, setCashNumber] = useState("");
  const [smartReceipt, setSmartReceipt] = useState(false);
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

  const updateList = (key: string, value: any) => setData(previous => ({ ...previous, [key]: itemsOf(value) }));

  const loadTab = useCallback(async (target: TabId = tab) => {
    setLoading(true);
    try {
      if (target === "overview") setOverview(await call("admin.overview"));
      if (target === "users" && (can("users") || can("suspend"))) updateList("users", await call("admin.users"));
      if (target === "customerActivity" && isAdmin) updateList("customerActivity", await call("adminPortal.customerActivity"));
      if (target === "receipts" && can("receipts")) updateList("bookings", await call("admin.bookings"));
      if (target === "qrLogs" && can("receipts")) updateList("qrLogs", await call("admin.qrLogs"));
      if (target === "subscriptions" && (can("receipts") || can("subscriptions"))) updateList("subscriptions", await call("admin.subscriptionRequests"));
      if (target === "chats" && can("chats")) updateList("chats", await call("chat.moderationRooms"));
      if (target === "venues" && can("pitches")) updateList("venues", (await call("admin.allPitches"))?.items || []);
      if (target === "suggestions" && can("pitches")) updateList("suggestions", await call("suggestions.list"));
      if (target === "reports" && can("reports")) updateList("reports", await call("reports.list"));
      if (target === "rewards" && can("rewards")) { const [catalog, vouchers, points] = await Promise.all([call("adminPortal.rewards.list"), call("adminPortal.vouchers.list"), call("adminPortal.rewards.points")]); updateList("rewards", catalog); updateList("vouchers", vouchers); updateList("points", points); }
      if (target === "admins" && role === "super_admin") { const result = await call("adminPortal.admins.list"); setAdmins(itemsOf(result)); }
      if (target === "audit" && isAdmin) { const result = await call("adminPortal.audit"); setAudit(itemsOf(result)); }
      if (target === "chat" && can("chats")) { const result = await call("adminPortal.chat.rooms"); setRooms(itemsOf(result)); }
      if (target === "settings" && can("settings")) {
        const [plans, smart] = await Promise.all([call("subscriptions.plans"), call("admin.smartReceiptVerification")]);
        updateList("plans", plans); setCashNumber(String(plans?.vodafoneCashNumber || "")); setSmartReceipt(Boolean(smart?.enabled));
      }
      if (target === "download" && can("downloads")) { const [config, stats] = await Promise.all([call("downloadSettings.admin"), call("downloadSettings.stats")]); setDownloadConfig(config); setDownloadStats(stats); }
      if (target === "assistant" && isAdmin) setAssistant(await call("adminAssistant.snapshot"));
    } catch (e: any) { setNotice(e.message || "تعذر تحميل القسم"); }
    finally { setLoading(false); }
  }, [tab, role, permissions.join(",")]);
  useEffect(() => {
    void loadTab(tab);
    if (tab !== "overview") return;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void loadTab("overview"); }, 30000);
    return () => window.clearInterval(timer);
  }, [tab, loadTab]);
  useEffect(() => {
    if (tab !== "chat" || !selectedRoom) return;
    const loadMessages = async () => { try { const result = await call("adminPortal.chat.messages", { roomId: selectedRoom }); setMessages(itemsOf(result)); } catch (e: any) { setNotice(e.message); } };
    void loadMessages();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void loadMessages(); }, 12000);
    return () => window.clearInterval(timer);
  }, [tab, selectedRoom]);

  const refresh = () => void loadTab(tab);
  const act = async (path: string, input: AnyRecord, message: string, nextTab: TabId = tab) => { try { await mutation(path, input); setNotice(message); await loadTab(nextTab); } catch (e: any) { setNotice(e.message); } };
  const createAdmin = async (input: CreateAdminInput) => { await mutation("adminPortal.admins.create", input); setNotice("تم إنشاء حساب المشرف بالبريد المحدد."); await loadTab("admins"); };
  const linkExistingAdmin = async (input: LinkAdminInput) => { await mutation("adminPortal.admins.linkExisting", input); setNotice("تم ربط الحساب القائم بالصلاحيات المحددة دون تغيير بياناته."); await loadTab("admins"); };
  const saveAdminEdit = async (admin: AnyRecord) => { const edit = userEdits[admin.id] || { role: admin.role, permissions: (admin.moderatorPermissions || []).join(",") }; await act("adminPortal.admins.update", { userId: admin.id, role: edit.role, permissions: edit.permissions.split(",").map(x => x.trim()).filter(Boolean), isSuspended: Boolean(admin.isSuspended) }, "تم تحديث دور وصلاحيات المشرف.", "admins"); };
  const changeAdminState = async (admin: AnyRecord) => await act("adminPortal.admins.update", { userId: admin.id, isSuspended: !admin.isSuspended }, admin.isSuspended ? "تم تفعيل المشرف." : "تم تعليق المشرف.", "admins");
  const removeAdmin = async (admin: AnyRecord) => { if (window.confirm(`إزالة صلاحيات ${admin.name || admin.email}؟`)) await act("adminPortal.admins.remove", { userId: admin.id }, "تمت إزالة صلاحيات المشرف.", "admins"); };
  const changeUserState = async (item: AnyRecord) => await act("admin.updateModerator", { userId: Number(item.id), isSuspended: !item.isSuspended }, item.isSuspended ? "تم تفعيل الحساب." : "تم إيقاف الحساب.", "users");
  const saveUserRole = async (item: AnyRecord) => {
    const defaultRole = item.role === "moderator" ? "moderator" : item.accountType === "owner" ? "owner" : "player";
    const edit = userEdits[item.id] || { role: defaultRole, permissions: (item.moderatorPermissions || []).join(",") };
    const permissions = edit.role === "moderator" ? edit.permissions.split(",").map(x => x.trim()).filter(Boolean) : [];
    try {
      await mutation("admin.updateModerator", { userId: Number(item.id), role: edit.role, permissions });
      setUserEdits(previous => { const next = { ...previous }; delete next[item.id]; return next; });
      setNotice("تم تحديث الدور والصلاحيات.");
      await loadTab("users");
    } catch (error: any) {
      setNotice(error.message || "تعذر حفظ الدور والصلاحيات.");
    }
  };
  const reviewSubscription = async (item: AnyRecord, status: "approved" | "rejected") => await act("admin.reviewSubscription", { id: Number(item.id), status, note: rejectReason || undefined }, status === "approved" ? "تم قبول الاشتراك وتفعيل الحساب." : "تم رفض الاشتراك وإرسال السبب.", "subscriptions");
  const reviewPitch = async (item: AnyRecord, decision: "approve" | "reject") => await act("admin.reviewPitch", { id: Number(item.id), decision, reason: rejectReason || undefined }, decision === "approve" ? "تم اعتماد الملعب ونشره." : "تم رفض صفحة الملعب.", "venues");
  const updatePitchStatus = async (item: AnyRecord, status: "published" | "suspended" | "rejected" | "draft") => await act("admin.updatePitchStatus", { id: Number(item.id), status, reason: rejectReason || undefined }, status === "published" ? "تم إعادة نشر الملعب." : status === "suspended" ? "تم إيقاف الملعب." : "تم تحديث حالة الملعب.", "venues");
  const reviewBooking = async (item: AnyRecord, status: "approved" | "rejected" | "cancelled") => await act("admin.reviewBooking", { id: Number(item.id), status, note: rejectReason || undefined }, status === "approved" ? "تم قبول الحجز وإصدار QR." : status === "rejected" ? "تم رفض الحجز." : "تم إلغاء الحجز.", "receipts");
  const moderateMessage = async (message: AnyRecord) => { if (window.confirm("حذف الرسالة من جميع الأطراف؟")) await act("admin.moderateMessage", { messageId: Number(message.id), reason: "إجراء إشراف إداري" }, "تمت إزالة الرسالة من الشات.", "chats"); };
  const reviewSuggestion = async (item: AnyRecord, status: "accepted" | "rejected") => await act("suggestions.review", { id: Number(item.id), status }, status === "accepted" ? "تم قبول الاقتراح." : "تم رفض الاقتراح.", "suggestions");
  const reviewReport = async (item: AnyRecord, status: "reviewing" | "resolved" | "dismissed") => await act("reports.review", { id: Number(item.id), status, resolution: rejectReason || undefined }, status === "reviewing" ? "تم وضع البلاغ قيد المراجعة." : status === "resolved" ? "تم حل البلاغ وتوثيق الإجراء." : "تم إغلاق البلاغ وإرسال السبب.", "reports");
  const saveCash = async (event: React.FormEvent) => { event.preventDefault(); await act("admin.updateSettings", { key: "vodafone_cash_number", value: cashNumber.trim() }, "تم تحديث رقم Vodafone Cash.", "settings"); };
  const toggleSmart = async () => { const next = !smartReceipt; setSmartReceipt(next); try { await mutation("admin.setSmartReceiptVerification", { enabled: next }); setNotice(next ? "تم تفعيل التحقق الذكي من الإيصالات." : "تم إيقاف التحقق الذكي."); } catch (e: any) { setSmartReceipt(!next); setNotice(e.message); } };
  const addPlan = async (event: React.FormEvent) => { event.preventDefault(); let imageUrl: string | undefined; if (planImageFile) { if (!/^image\/(jpeg|png|webp)$/.test(planImageFile.type) || planImageFile.size > 8 * 1024 * 1024) { setNotice("ارفع صورة باقة بصيغة JPG أو PNG أو WebP حتى 8 ميغابايت."); return; } const uploaded = await mutation("uploads.image", { fileName: planImageFile.name, mimeType: planImageFile.type, dataBase64: (await readFileAsDataUrl(planImageFile)).split(",", 2)[1] || "" }); imageUrl = uploaded.url; } await act("admin.createPlan", { name: planForm.name, price: Number(planForm.price), durationDays: Number(planForm.durationDays), ...(imageUrl ? { imageUrl } : {}) }, "تمت إضافة الباقة.", "settings"); setPlanForm({ name: "", price: "", durationDays: "30" }); setPlanImageFile(null); };
  const editPlan = async (plan: AnyRecord) => { const name = window.prompt("اسم الباقة", String(plan.name || "")); if (name === null) return; const price = window.prompt("السعر بالجنيه", String(plan.price || "")); if (price === null) return; const durationDays = window.prompt("المدة بالأيام", String(plan.durationDays || 30)); if (durationDays === null) return; await act("admin.updatePlan", { id: Number(plan.id), name: name.trim(), price: Number(price), durationDays: Number(durationDays) }, "تم تحديث الباقة.", "settings"); };
  const saveDownload = async (event: React.FormEvent) => { event.preventDefault(); try { let next = { ...downloadConfig }; if (apkFile) { const dataBase64 = await readFileAsDataUrl(apkFile); const uploaded = await mutation("downloadSettings.apk", { fileName: apkFile.name, dataBase64 }); next = { ...next, mode: "upload", fileKey: uploaded.key, url: `/manus-storage/${uploaded.key}` }; } await mutation("downloadSettings.save", { mode: next.mode || null, fileKey: next.fileKey || undefined, url: next.mode === "url" ? next.url : undefined, appName: next.appName, version: next.version, windowsUrl: next.windowsUrl, windowsFileName: next.windowsFileName, supportLink: next.supportLink, supportNumbers: Array.isArray(next.supportNumbers) ? next.supportNumbers : String(next.supportNumbers || "").split(/[\n,;]+/).filter(Boolean) }); setApkFile(null); setNotice("تم حفظ إعدادات APK وWindows."); await loadTab("download"); } catch (e: any) { setNotice(e.message); } };
  const createRoom = async (event: React.FormEvent) => { event.preventDefault(); await act("adminPortal.chat.createRoom", { name: groupName, memberIds: memberIds.split(",").map(Number).filter(Boolean), isGroup: memberIds.split(",").filter(Boolean).length > 1 }, "تم إنشاء غرفة العمل.", "chat"); setGroupName(""); setMemberIds(""); };
  const sendAdminMessage = async (event: React.FormEvent) => { event.preventDefault(); if (!selectedRoom || !draft.trim()) return; await mutation("adminPortal.chat.send", { roomId: selectedRoom, body: draft.trim(), messageType: "text" }); setDraft(""); const result = await call("adminPortal.chat.messages", { roomId: selectedRoom }); setMessages(itemsOf(result)); };
  const askAssistant = async (event: React.FormEvent) => { event.preventDefault(); if (!assistantPrompt.trim()) return; try { const result = await mutation("adminAssistant.ask", { prompt: assistantPrompt.trim(), history: assistantHistory.slice(-8) }); setAssistantAnswer(result); setAssistantHistory(previous => [...previous, { role: "user", content: assistantPrompt.trim() }, { role: "assistant", content: result.answer }]); setAssistantPrompt(""); } catch (e: any) { setNotice(e.message); } };
  const executeAssistantAction = async () => { const action = assistantAnswer?.action; if (!action) return; try { if (action.type === "reply_reports") await mutation("adminAssistant.sendReportReply", { reportIds: action.reportIds, message: action.message }); else await mutation("adminAssistant.setOwnerAccess", { ownerId: action.ownerId, suspended: action.suspended }); setNotice("تم تنفيذ الإجراء بعد تأكيدك."); setAssistantAnswer(null); await loadTab("assistant"); } catch (e: any) { setNotice(e.message); } };

  const navTabs = useMemo(() => ([
    ["overview", "نظرة عامة", true], ["assistant", "المساعد الذكي", isAdmin], ["users", "المستخدمون", can("users") || can("suspend")], ["customerActivity", "نشاط العملاء", isAdmin], ["receipts", "الحجوزات والإيصالات", can("receipts")], ["qrLogs", "سجلات QR", can("receipts")], ["subscriptions", "الاشتراكات", can("receipts") || can("subscriptions")], ["chats", "مراقبة الشات", can("chats")], ["venues", "مراجعة الملاعب", can("pitches")], ["suggestions", "اقتراحات الملاعب", can("pitches")], ["reports", "البلاغات", can("reports")], ["rewards", "المكافآت والقسائم", can("rewards")], ["settings", "الباقات والإعدادات", can("settings")], ["download", "التنزيلات والإحصاءات", can("downloads")], ["admins", "المشرفون والصلاحيات", role === "super_admin"], ["audit", "سجل النشاط", isAdmin], ["chat", "الشات الإداري", can("chats")],
  ] as [TabId, string, boolean][]).filter(item => item[2]), [role, isAdmin, permissions.join(",")]);
  const titles: Record<string, string> = Object.fromEntries(navTabs.map(([id, label]) => [id, label]));
  const navGroups = tabGroupDefinitions.map(([label, ids]) => ({ label, tabs: navTabs.filter(([id]) => ids.includes(id)) })).filter(group => group.tabs.length > 0);
  const visibleUsers = data.users.filter(item => {
    const matchesFilter = filter === "all" || (filter === "player" ? item.accountType === "player" : filter === "owner" ? item.accountType === "owner" : item.role === "moderator");
    const query = userSearch.trim().toLowerCase();
    return matchesFilter && (!query || [item.name, item.email, item.phone, item.id].some(value => String(value ?? "").toLowerCase().includes(query)));
  });
  const stats = [["المستخدمون", overview.users], ["الملاعب", overview.pitches], ["الحجوزات", overview.bookings], ["إيراد حجوزات مؤكد", formatMoney(overview.revenue ?? 0)], ["بلاغات مفتوحة", overview.openReports], ["اشتراكات معلقة", overview.pendingSubscriptions]];

  return <div className="app-shell"><aside className="sidebar"><div className="side-brand"><span className="side-logo"><img src="/brzly-logo.svg" alt="" /></span><div><b>البرازيلي</b><small>CONTROL ROOM</small></div></div><nav aria-label="أقسام الإدارة">{navGroups.map(group => <div className="nav-group" key={group.label}><span className="nav-group-title">{group.label}</span>{group.tabs.map(([id, label]) => { const Icon = tabIcons[id]; return <button className={tab === id ? "active" : ""} aria-current={tab === id ? "page" : undefined} title={label} onClick={() => setTab(id)} key={id}><Icon size={17} strokeWidth={1.8} /><span>{label}</span></button>; })}</div>)}</nav><div className="side-user"><span>{(user.name || user.email || "م").slice(0, 1)}</span><div><b>{user.name || "مدير النظام"}</b><small>{role === "super_admin" ? "المدير العام" : role === "admin" ? "مدير" : "مشرف"}</small></div><button onClick={onLogout}>خروج</button></div></aside><main className="content"><header className="topbar"><div><span className="overline">EL BARZILY / OPERATIONS</span><h2>{titles[tab]}</h2></div><div className="topbar-actions"><button className="refresh-button" onClick={refresh}>تحديث</button><div className="live-pill"><span /> غرفة آمنة · تحديث كل 30 ثانية</div></div></header>{notice && <div className="notice" onClick={() => setNotice("")}>{notice}</div>}{loading && <div className="loading-bar" />}

    {tab === "overview" && <>
      <section className="hero-panel"><div><span className="overline">ADMIN INTELLIGENCE</span><h1>كل قرار واضح.<br /><em>كل حركة موثقة.</em></h1><p>كل أقسام لوحة الإدارة القديمة أصبحت متاحة من غرفة تحكم واحدة مع نفس الصلاحيات وBackend المشترك.</p></div><div className="hero-ring"><b>{overview.pendingBookings ?? 0}</b><small>حجوزات قيد المتابعة</small></div></section>
      <section className="stats-grid">{stats.map(([label, value]) => <article key={String(label)}><small>{label}</small><strong>{value ?? "—"}</strong><span>مزامنة مباشرة</span></article>)}</section>
      <AdminActivityChart data={overview.dailyActivity || []} />
      <div className="feature-grid"><Panel eyebrow="قائمة المتابعة" title="طلبات تحتاج قراراً"><div className="quick-actions">{can("receipts") && <button onClick={() => setTab("subscriptions")}>طلبات الاشتراك <b>{overview.pendingSubscriptions ?? 0}</b></button>}{can("reports") && <button onClick={() => setTab("reports")}>البلاغات المفتوحة <b>{overview.openReports ?? 0}</b></button>}{isAdmin && <button onClick={() => setTab("venues")}>صفحات الملاعب قيد المراجعة <b>فتح القسم</b></button>}{isAdmin && <button onClick={() => setTab("download")}>إدارة ملفات التطبيق <b>APK / Windows</b></button>}</div></Panel><Panel eyebrow="النطاق المنقول" title="كل خصائص اللوحة القديمة"><div className="feature-tags">{["المستخدمون", "الحجوزات والإيصالات", "الاشتراكات", "سجلات QR", "مراجعة الشات", "اعتماد الملاعب", "الاقتراحات", "البلاغات", "الباقات", "التنزيلات", "المساعد الذكي"].map(item => <span key={item}>{item}</span>)}</div></Panel></div>
    </>}

    {tab === "assistant" && <Panel eyebrow="AI OPERATIONS" title="المساعد الذكي للإدارة"><div className="assistant-layout"><div className="assistant-context"><b>البيانات الحية</b><span>{assistant?.summary?.totalUsers ?? 0} مستخدم</span><span>{assistant?.summary?.openReports ?? 0} بلاغ مفتوح</span><span>{assistant?.summary?.pendingSubscriptions ?? 0} اشتراك معلق</span><small>المساعد يقترح الإجراءات فقط ولا ينفذها دون تأكيدك.</small></div><div className="assistant-main"><div className="assistant-answer">{assistantAnswer ? <><b>إجابة المساعد</b><p>{assistantAnswer.answer}</p>{assistantAnswer.action && <div className="proposal"><span>إجراء مقترح: {assistantAnswer.action.type === "reply_reports" ? "الرد على البلاغات" : assistantAnswer.action.suspended ? "إيقاف صاحب ملعب" : "إعادة تفعيل صاحب ملعب"}</span><button className="gold-button" onClick={() => void executeAssistantAction()}>تأكيد وتنفيذ</button></div>}</> : <Empty text="اكتب سؤالاً مثل: اعرض ملخص الاشتراكات المعلقة أو اقترح متابعة البلاغات." />}</div><form className="assistant-form" onSubmit={askAssistant}><textarea value={assistantPrompt} onChange={e => setAssistantPrompt(e.target.value)} placeholder="اسأل المساعد عن الحجوزات والبلاغات والاشتراكات…" /><button className="gold-button">تحليل البيانات</button></form></div></div></Panel>}

    {tab === "users" && <Panel
      eyebrow="ROLES & ACCESS"
      title="المستخدمون والأدوار"
      action={<div className="filter-row"><input className="filter-search" value={userSearch} onChange={e => setUserSearch(e.target.value)} placeholder="بحث بالاسم أو البريد أو الهاتف أو ID" />{[["all", "الكل"], ["player", "اللاعبون"], ["owner", "أصحاب الملاعب"], ["moderator", "المشرفون"]].map(([id, label]) => <button className={filter === id ? "selected" : ""} onClick={() => setFilter(id)} key={id}>{label}</button>)}</div>}
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
            <td><b>{item.name || "مستخدم"}</b><small>#{item.id} · {item.email || "بريد غير مسجل"}</small>{item.phone && <small>{item.phone}</small>}<small>{item.lastSeenAt && Date.now() - new Date(item.lastSeenAt).getTime() < 120000 ? "متصل الآن" : `آخر ظهور: ${formatDate(item.lastSeenAt)}`}</small>{item.ownerSubscriptionExpiresAt && <small>اشتراك الكابتن حتى: {formatDate(item.ownerSubscriptionExpiresAt)}</small>}</td>
            <td><select value={edit.role} disabled={!canEditRole} onChange={e => setUserEdits(previous => ({ ...previous, [item.id]: { ...edit, role: e.target.value } }))}><option value="player">لاعب</option><option value="owner">صاحب ملعب</option><option value="moderator">مشرف</option></select></td>
            <td><Status value={item.isSuspended ? "suspended" : "active"} /></td>
            <td><PermissionPicker value={edit.permissions} disabled={!canEditRole || edit.role !== "moderator"} onChange={permissions => setUserEdits(previous => ({ ...previous, [item.id]: { ...edit, permissions: permissions.join(",") } }))} /></td>
            <td className="actions">{canSuspendUser && <button className="outline-button" onClick={() => void changeUserState(item)}>{item.isSuspended ? "تفعيل" : "إيقاف"}</button>}{canEditRole && hasRoleChanges && <button className="quiet-button" onClick={() => void saveUserRole(item)}>حفظ الدور والصلاحيات</button>}</td>
          </tr>;
        })}
      </tbody></table></div>
      {!visibleUsers.length && <Empty text="لا توجد حسابات في هذا التصنيف." />}
    </Panel>}

    {tab === "receipts" && <Panel eyebrow="BOOKINGS & RECEIPTS" title="إدارة الحجوزات"><div className="notice-inline">يمكن للإدارة مراجعة الحجز واتخاذ الإجراء مع تسجيل ملاحظة. لا يظهر رمز QR الخام داخل اللوحة.</div><div className="record-list">{data.bookings.map(item => <article className="record" key={item.id}><div><b>#{item.id} · {item.playerName || `لاعب #${item.playerId}`} — {item.pitchName || `ملعب #${item.pitchId}`}</b><small>{formatDate(item.startsAt)} · المبلغ {formatMoney(item.paymentAmount ?? item.price)} · طريقة الدفع: {item.paymentMethod || "—"}</small><small>{item.playerEmail || ""} {item.playerPhone ? ` · ${item.playerPhone}` : ""}</small>{item.receiptUrl && <a href={item.receiptUrl} target="_blank" rel="noreferrer">عرض إيصال الدفع</a>}{item.reviewNote && <small>ملاحظة سابقة: {item.reviewNote}</small>}</div><div className="record-side"><Status value={item.status} />{["pending", "approved"].includes(item.status) && <div className="actions">{item.status === "pending" && <><button className="approve-button" onClick={() => void reviewBooking(item, "approved")}>قبول وإصدار QR</button><button className="reject-button" onClick={() => void reviewBooking(item, "rejected")}>رفض</button></>}{<button className="outline-button" onClick={() => void reviewBooking(item, "cancelled")}>إلغاء إداري</button>}</div>}</div></article>)}</div>{!data.bookings.length && <Empty text="لا توجد حجوزات مسجلة." />}<input className="wide-input" value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="ملاحظة الإجراء أو سبب الرفض/الإلغاء (اختياري)" /></Panel>}

    {tab === "qrLogs" && <Panel eyebrow="ENTRY AUDIT" title="سجلات QR للحجوزات"><div className="record-list">{data.qrLogs.map(item => <article className="record" key={item.id}><div><b>الحجز #{item.bookingId} · {item.pitchName || "ملعب غير متاح"}</b><small>الحساب #{item.userId} · {item.action === "validated" ? "تم التحقق" : item.action}</small><small>{formatDate(item.createdAt)}</small></div><span className="tag">لا يتم كشف الرمز</span></article>)}</div>{!data.qrLogs.length && <Empty text="لا توجد سجلات QR بعد." />}</Panel>}

    {tab === "subscriptions" && <Panel eyebrow="OWNER PAYMENTS" title="طلبات الاشتراك"><div className="record-list">{data.subscriptions.map(item => <article className="record" key={item.id}><div><b>طلب اشتراك #{item.id} · الحساب #{item.ownerId}</b><small>الباقة #{item.planId} · {formatDate(item.createdAt)} · Vodafone Cash: {item.vodafoneCashNumber || "—"}</small><small>مرجع الدفع: {item.paymentReference || "—"}</small>{item.receiptUrl && <a href={item.receiptUrl} target="_blank" rel="noreferrer">عرض إيصال الاشتراك</a>}{item.reviewNote && <small>الملاحظة: {item.reviewNote}</small>}</div><div className="record-side"><Status value={item.status} />{item.status === "pending" && <div className="actions"><button className="approve-button" onClick={() => void reviewSubscription(item, "approved")}>قبول وتفعيل</button><button className="reject-button" onClick={() => void reviewSubscription(item, "rejected")}>رفض</button></div>}</div></article>)}</div>{!data.subscriptions.length && <Empty text="لا توجد طلبات اشتراك." />}<input className="wide-input" value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="سبب الرفض أو ملاحظة المراجعة (اختياري)" /></Panel>}

    {tab === "chats" && <Panel eyebrow="MODERATION" title="مراجعة محادثات المستخدمين"><form className="form-grid" onSubmit={async event => { event.preventDefault(); await act("chat.createClosedRoom", { userA: Number((event.currentTarget.elements.namedItem("userA") as HTMLInputElement).value), userB: Number((event.currentTarget.elements.namedItem("userB") as HTMLInputElement).value), name: (event.currentTarget.elements.namedItem("roomName") as HTMLInputElement).value }, "تم إنشاء غرفة نزاع ثنائية.", "chats"); }}><input name="userA" type="number" min="1" placeholder="معرّف المستخدم الأول" required /><input name="userB" type="number" min="1" placeholder="معرّف المستخدم الثاني" required /><input name="roomName" placeholder="اسم غرفة النزاع" defaultValue="غرفة حل نزاع" required /><button className="outline-button">إنشاء غرفة خاصة لشخصين</button></form><div className="record-list">{data.chats.map(room => <article className="record" key={room.id}><div><b>{room.name} · غرفة #{room.id}</b><small>{room.roomType || "محادثة"} · الأعضاء: {(room.members || []).map((member: AnyRecord) => member.name || `#${member.id}`).join("، ") || "—"}</small><div className="moderation-messages">{(room.messages || []).slice(0, 6).map((message: AnyRecord) => <p key={message.id}><b>{message.senderName || `#${message.senderId}`}</b> {message.body}<small>{formatDate(message.createdAt)}</small><button className="danger-link" onClick={() => void moderateMessage(message)}>إزالة الرسالة</button></p>)}</div></div></article>)}</div>{!data.chats.length && <Empty text="لا توجد غرف محادثة." />}</Panel>}

    {tab === "venues" && <Panel eyebrow="PITCH CONTROL" title="إدارة كل الملاعب"><div className="notice-inline">تظهر هنا الملاعب الجديدة والمنشورة والموقوفة. تعرض البطاقة بيانات الملعب والمالك والكابتن والأسعار والدفع والملاعب الفرعية لمراجعتها قبل القرار.</div><div className="record-list">{data.venues.map(item => { const pitch = item.pitch || item; const fields = itemsOf(item.fields); const amenities = Array.isArray(pitch.amenities) ? pitch.amenities.map(String).join("، ") : typeof pitch.amenities === "string" ? pitch.amenities : pitch.amenities ? JSON.stringify(pitch.amenities) : ""; return <article className="record venue-record" key={pitch.id}><div className="venue-review-details"><b>{pitch.name} · طلب #{pitch.id} · حساب المالك #{pitch.ownerId}</b><small>المالك: {item.ownerName || "غير مسجل"} · البريد: {item.ownerEmail || "—"} · الهاتف: {item.ownerPhone || "—"}</small><small>الموقع: {pitch.address || "—"} · {pitch.city || "—"}{pitch.latitude != null || pitch.longitude != null ? ` · الإحداثيات: ${pitch.latitude ?? "—"}, ${pitch.longitude ?? "—"}` : ""}</small><small>الكابتن الرئيسي: {pitch.captainName || "—"} · هاتف الكابتن: {pitch.captainPhone || "—"}</small><small>عدد الملاعب الفرعية: {pitch.subPitchCount ?? "—"} · السعر صباحاً: {formatMoney(pitch.morningPrice)} · السعر مساءً: {formatMoney(pitch.eveningPrice)}</small><small>الحجز والدفع: {pitch.bookingPaymentMode === "deposit" ? `عربون ${formatMoney(pitch.depositAmount)}` : "الدفع عند الوصول"} · Vodafone Cash: {pitch.vodafoneCashNumber || "—"}</small>{pitch.description && <small>الوصف: {pitch.description}</small>}{amenities && <small>المرافق والمزايا: {amenities}</small>}<small>الحالة: {statusText(pitch.status)} · تاريخ الإرسال: {formatDate(pitch.createdAt)} · آخر تحديث: {formatDate(pitch.updatedAt)}</small><div className="venue-review-links">{pitch.mapUrl && <a href={pitch.mapUrl} target="_blank" rel="noreferrer">فتح موقع الملعب</a>}{pitch.imageUrl && <a href={pitch.imageUrl} target="_blank" rel="noreferrer">عرض صورة الملعب</a>}</div>{fields.length > 0 && <details className="venue-subpitch-details" open><summary>تفاصيل الملاعب الفرعية ({fields.length})</summary>{fields.map((field: AnyRecord) => <small key={field.id}>{field.name} · {field.sport || "رياضة غير محددة"} · السعة {field.capacity} · {formatMoney(field.hourlyPrice)} للساعة · {field.isActive ? "نشط" : "موقوف"}</small>)}</details>}</div><div className="actions">{["pending", "draft"].includes(pitch.status) && <button className="approve-button" onClick={() => void reviewPitch(pitch, "approve")}>قبول ونشر</button>}{pitch.status === "published" ? <button className="reject-button" onClick={() => void updatePitchStatus(pitch, "suspended")}>إيقاف</button> : <button className="approve-button" onClick={() => void updatePitchStatus(pitch, "published")}>نشر/إعادة نشر</button>}{pitch.status !== "rejected" && <button className="outline-button" onClick={() => void updatePitchStatus(pitch, "rejected")}>رفض</button>}</div></article>; })}</div>{!data.venues.length && <Empty text="لا توجد ملاعب مسجلة." />}<input className="wide-input" value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="سبب تغيير الحالة (اختياري)" /></Panel>}

    {tab === "suggestions" && <Panel eyebrow="COMMUNITY" title="اقتراحات الملاعب"><div className="record-list">{data.suggestions.map(item => <article className="record" key={item.id}><div><b>{item.name} · حساب #{item.userId}</b><small>{item.address} · {item.city} · {statusText(item.status)}</small>{item.notes && <small>{item.notes}</small>}</div>{item.status === "pending" ? <div className="actions"><button className="approve-button" onClick={() => void reviewSuggestion(item, "accepted")}>قبول</button><button className="reject-button" onClick={() => void reviewSuggestion(item, "rejected")}>رفض</button></div> : <Status value={item.status} />}</article>)}</div>{!data.suggestions.length && <Empty text="لا توجد اقتراحات جديدة." />}</Panel>}

    {tab === "reports" && <Panel eyebrow="TRUST & SAFETY" title="البلاغات والشكاوى"><div className="record-list">{data.reports.map(item => <article className="record" key={item.id}><div><b>بلاغ #{item.id} · {item.targetType || "بلاغ مستخدم"} #{item.targetId || "—"}</b><small>المبلّغ #{item.reporterId} · السبب: {item.reason || "—"}</small><small>{item.details || "لا توجد تفاصيل"}</small><Status value={item.status} /></div>{["open", "reviewing"].includes(item.status) && <div className="actions"><button className="outline-button" onClick={() => void reviewReport(item, "reviewing")}>تمت المراجعة</button><button className="approve-button" onClick={() => void reviewReport(item, "resolved")}>حل البلاغ</button><button className="reject-button" onClick={() => void reviewReport(item, "dismissed")}>إغلاق البلاغ</button></div>}</article>)}</div>{!data.reports.length && <Empty text="لا توجد بلاغات مفتوحة." />}<input className="wide-input" value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="سبب الحل أو الإغلاق" /></Panel>}

    {tab === "rewards" && <RewardsPanel rewards={data.rewards} vouchers={data.vouchers} points={data.points} canCancel={isAdmin} onRefresh={() => void loadTab("rewards")} onNotice={setNotice} />}

    {tab === "settings" && <div className="feature-grid"><Panel eyebrow="PLANS" title="إدارة باقات الملاعب"><form className="form-grid" onSubmit={addPlan}><input placeholder="اسم الباقة" value={planForm.name} onChange={e => setPlanForm({ ...planForm, name: e.target.value })} required /><input type="number" min="0" placeholder="السعر بالجنيه" value={planForm.price} onChange={e => setPlanForm({ ...planForm, price: e.target.value })} required /><input type="number" min="1" placeholder="المدة بالأيام" value={planForm.durationDays} onChange={e => setPlanForm({ ...planForm, durationDays: e.target.value })} required /><label className="file-label"><span>صورة الباقة (اختياري)</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setPlanImageFile(e.target.files?.[0] || null)} /><small>{planImageFile?.name || "بدون صورة — سيتم اختيار صورة فاخرة تلقائياً"}</small></label><button className="gold-button">إضافة الباقة</button></form><div className="record-list compact-list">{data.plans.map(plan => <article className="record" key={plan.id}><div>{plan.imageUrl && <img className="plan-admin-thumb" src={plan.imageUrl} alt="" />}<b>{plan.name}</b><small>{formatMoney(plan.price)} · {plan.durationDays} يوم · {plan.isActive ? "نشطة" : "موقوفة"}</small></div><div className="actions"><button className="quiet-button" onClick={() => void editPlan(plan)}>تعديل</button>{plan.isActive ? <button className="reject-button" onClick={() => void act("admin.updatePlan", { id: Number(plan.id), isActive: false }, "تم إيقاف الباقة.", "settings")}>إيقاف</button> : <button className="approve-button" onClick={() => void act("admin.updatePlan", { id: Number(plan.id), isActive: true }, "تم إعادة تفعيل الباقة.", "settings")}>إعادة تفعيل</button>}</div></article>)}</div></Panel><Panel eyebrow="PAYMENT SECURITY" title="التحقق الذكي من الإيصالات"><label className="switch-row"><span><b>{smartReceipt ? "الفحص التلقائي مفعّل" : "المراجعة اليدوية مفعّلة"}</b><small>{smartReceipt ? "مطابقة المبلغ ورقم المحفظة قبل التفعيل." : "الإيصالات تصل للمراجعة اليدوية."}</small></span><input type="checkbox" checked={smartReceipt} onChange={() => void toggleSmart()} /></label></Panel><Panel eyebrow="TRANSFER SETTINGS" title="Vodafone Cash"><form onSubmit={saveCash} className="stack-form"><label>رقم Vodafone Cash<input value={cashNumber} onChange={e => setCashNumber(e.target.value)} placeholder="01X XXXX XXXX" /></label><button className="gold-button">حفظ الرقم</button></form></Panel><Panel eyebrow="SECURITY" title="الأسرار المحمية"><p className="muted">تُدار مفاتيح SMTP وManus من مخزن الأسرار المحمي ولا تظهر داخل اللوحة أو المتصفح.</p></Panel></div>}

    {tab === "download" && <div className="feature-grid"><Panel eyebrow="RELEASE CONTROL" title="إعدادات APK وWindows"><form onSubmit={saveDownload} className="stack-form"><label>اسم التطبيق<input value={downloadConfig.appName || ""} onChange={e => setDownloadConfig({ ...downloadConfig, appName: e.target.value })} /></label><div className="form-grid"><label>الإصدار<input value={downloadConfig.version || ""} onChange={e => setDownloadConfig({ ...downloadConfig, version: e.target.value })} /></label><label>اسم ملف Windows<input value={downloadConfig.windowsFileName || ""} onChange={e => setDownloadConfig({ ...downloadConfig, windowsFileName: e.target.value })} /></label></div><label>رابط Windows المباشر<input value={downloadConfig.windowsUrl || ""} onChange={e => setDownloadConfig({ ...downloadConfig, windowsUrl: e.target.value })} placeholder="https:// أو /manus-storage/..." /></label><label>رابط APK الخارجي عند استخدام URL<input value={downloadConfig.url || ""} onChange={e => setDownloadConfig({ ...downloadConfig, mode: "url", url: e.target.value })} placeholder="https://..." /></label><label className="file-label">رفع APK جديد (اختياري)<input type="file" accept=".apk,application/vnd.android.package-archive" onChange={e => setApkFile(e.target.files?.[0] || null)} /><small>{apkFile?.name || downloadConfig.fileKey || "لم يختر ملفاً"}</small></label><label>أرقام واتساب الدعم<input value={Array.isArray(downloadConfig.supportNumbers) ? downloadConfig.supportNumbers.join(", ") : downloadConfig.supportNumbers || ""} onChange={e => setDownloadConfig({ ...downloadConfig, supportNumbers: e.target.value })} /></label><button className="gold-button">حفظ إصدار التحميل</button></form><div className="download-links"><a href={`${API_ORIGIN}/api/download/android?v=${encodeURIComponent(downloadConfig.version || "")}`} target="_blank" rel="noreferrer">اختبار تنزيل APK · {downloadConfig.version || "الإصدار الحالي"}</a><a href={`${API_ORIGIN}/api/download/windows?v=${encodeURIComponent(downloadConfig.version || "")}`} target="_blank" rel="noreferrer">اختبار تنزيل Windows · {downloadConfig.version || "الإصدار الحالي"}</a><a href="/download" target="_blank" rel="noreferrer">فتح صفحة التحميل العامة · {downloadConfig.version || "الإصدار الحالي"}</a></div></Panel><Panel eyebrow="DOWNLOAD ANALYTICS" title="إحصاءات التنزيل"><div className="stats-grid small-stats"><article><small>كل الطلبات</small><strong>{downloadStats.total ?? 0}</strong></article><article><small>Android</small><strong>{downloadStats.android ?? 0}</strong></article><article><small>Windows</small><strong>{downloadStats.windows ?? 0}</strong></article><article><small>آخر 30 يوماً</small><strong>{downloadStats.last30Days ?? 0}</strong></article></div><DownloadTrendChart data={downloadStats.daily} /><div className="analytics-lines"><b>الأجهزة</b>{(downloadStats.devices || []).slice(0, 6).map((item: AnyRecord) => <span key={item.name}>{item.name}: {item.total}</span>)}<b>الأنظمة</b>{(downloadStats.operatingSystems || []).slice(0, 6).map((item: AnyRecord) => <span key={item.name}>{item.name}: {item.total}</span>)}</div></Panel></div>}

    {tab === "admins" && <section className="panel"><div className="panel-head"><div><span className="overline">ACCESS MATRIX</span><h3>حسابات المشرفين</h3></div><span className="count-badge">{admins.length} حساب</span></div><div className="admin-layout"><div className="table-wrap"><table><thead><tr><th>المشرف</th><th>الدور</th><th>الصلاحيات</th><th>آخر دخول</th><th>الحالة</th><th /></tr></thead><tbody>{admins.map(admin => { const edit = userEdits[admin.id] || { role: admin.role, permissions: (admin.moderatorPermissions || []).join(",") }; return <tr key={admin.id}><td><b>{admin.name || "بدون اسم"}</b><small>{admin.email}</small></td><td><select value={edit.role} disabled={admin.role === "super_admin"} onChange={e => setUserEdits(previous => ({ ...previous, [admin.id]: { ...edit, role: e.target.value } }))}><option value="moderator">مشرف</option><option value="admin">مدير</option></select></td><td><PermissionPicker value={edit.permissions} disabled={admin.role === "super_admin"} onChange={permissions => setUserEdits(previous => ({ ...previous, [admin.id]: { ...edit, permissions: permissions.join(",") } }))} /></td><td>{formatDate(admin.lastSignedIn)}</td><td><span className={admin.isSuspended ? "status off" : "status"}>{admin.isSuspended ? "موقوف" : "نشط"}</span></td><td className="actions">{admin.role !== "super_admin" && <><button className="quiet-button" onClick={() => void saveAdminEdit(admin)}>حفظ</button><button className="outline-button" onClick={() => void changeAdminState(admin)}>{admin.isSuspended ? "تفعيل" : "تعليق"}</button><button className="danger-link" onClick={() => void removeAdmin(admin)}>إزالة</button></>}</td></tr>; })}</tbody></table></div><AdminProvisionForm onCreate={createAdmin} onLinkExisting={linkExistingAdmin} /></div></section>}

    {tab === "audit" && <Panel eyebrow="IMMUTABLE TRACE" title="سجل النشاط الإداري"><div className="audit-list">{audit.map(item => <article key={item.id}><span className="audit-dot" /><div><b>{item.action}</b><small>{item.actorName || item.actorEmail || `مشرف #${item.actorId}`} · {item.targetType || "system"}{item.targetId ? ` #${item.targetId}` : ""}</small></div><time>{formatDate(item.createdAt)}</time></article>)}</div>{!audit.length && <Empty />}</Panel>}

    {tab === "customerActivity" && <Panel eyebrow="CUSTOMER ACTIVITY" title="سجل نشاط العملاء"><div className="table-scroll"><table><thead><tr><th>العميل</th><th>النشاط</th><th>المسار</th><th>آخر ظهور</th><th>وقت التسجيل</th></tr></thead><tbody>{data.customerActivity.map(item => <tr key={item.id}><td><b>{item.userName || `عميل #${item.userId}`}</b><small>{item.userEmail || "—"} · {item.accountType === "owner" ? "كابتن" : item.userRole === "player" ? "لاعب" : item.userRole || "مستخدم"}</small></td><td><span className="tag">{item.action === "active" ? "نشاط وتصفح" : item.action}</span></td><td><code>{item.path || "/"}</code></td><td><span className={item.lastSeenAt && Date.now() - new Date(item.lastSeenAt).getTime() < 120000 ? "status" : "status off"}>{item.lastSeenAt && Date.now() - new Date(item.lastSeenAt).getTime() < 120000 ? "متصل الآن" : formatDate(item.lastSeenAt)}</span></td><td>{formatDate(item.createdAt)}</td></tr>)}</tbody></table></div>{!data.customerActivity.length && <Empty text="لا يوجد نشاط عملاء مسجل بعد." />}</Panel>}

    {tab === "chat" && <section className="chat-layout panel"><aside className="room-list"><div className="panel-head"><h3>المحادثات</h3><span className="count-badge">{rooms.length}</span></div>{rooms.map(room => <button className={selectedRoom === room.id ? "room active" : "room"} onClick={() => setSelectedRoom(room.id)} key={room.id}><span>{String(room.name || "م").slice(0, 1)}</span><div><b>{room.name}</b><small>{room.isGroup ? "مجموعة عمل" : "محادثة خاصة"}</small></div></button>)}<form className="room-create" onSubmit={createRoom}><input placeholder="اسم مجموعة جديدة" value={groupName} onChange={e => setGroupName(e.target.value)} required /><input placeholder="IDs المشرفين: 2,3" value={memberIds} onChange={e => setMemberIds(e.target.value)} required /><button>+ إنشاء مجموعة</button></form></aside><div className="conversation">{selectedRoom ? <><div className="conversation-head"><b>{rooms.find(r => r.id === selectedRoom)?.name || "المحادثة"}</b><small>تحديث تلقائي كل 12 ثانية عند فتح التبويب</small></div><div className="messages">{messages.map(m => <article className={m.senderId === user.id ? "mine" : ""} key={m.id}><b>{m.senderName || m.senderEmail}</b>{m.mediaUrl && <a href={`${API_ORIGIN}${m.mediaUrl}`} target="_blank" rel="noreferrer">مرفق</a>}<p>{m.body}</p><small>{formatDate(m.createdAt)}</small></article>)}</div><form className="composer" onSubmit={sendAdminMessage}><button type="button" onClick={() => setDraft(`${draft} 👍`)}>😊</button><input value={draft} onChange={e => setDraft(e.target.value)} placeholder="اكتب رسالة آمنة للفريق…" /><button className="send-button">إرسال</button></form></> : <div className="empty-chat"><span>✦</span><h3>اختر محادثة</h3><p>تواصل مع فريق الإدارة وشارك القرارات بأمان.</p></div>}</div></section>}
  </main></div>;
}

function App() {
  const [user, setUser] = useState<AnyRecord | null>(null);
  useEffect(() => { void call("auth.me").then(result => { if (result?.user) setUser(result.user); }).catch(() => undefined); }, []);
  const logout = async () => { await mutation("auth.logout").catch(() => undefined); setUser(null); };
  return user ? <Dashboard user={user} onLogout={logout} /> : <Login onDone={setUser} />;
}

createRoot(document.getElementById("root")!).render(<App />);
