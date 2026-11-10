import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { AlertCircle, ArrowLeft, Check, Copy, LoaderCircle, MessageCircle, RefreshCw, Share2, ShieldCheck, Ticket, Trophy, Users, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { PageHeading } from "@/features/app/AppShell";

const api = trpc as any;
const dateText = (value: unknown) => value ? new Date(String(value)).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" }) : "من غير تاريخ انتهاء";
const statusText: Record<string, string> = { valid: "صالحة للاستخدام", used: "اتستخدمت", expired: "انتهت صلاحيتها", cancelled: "اتلغت" };
const referralEventId = () => typeof globalThis.crypto?.randomUUID === "function" ? globalThis.crypto.randomUUID() : `evt-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function RewardArt({ src, alt = "" }: { src?: string | null; alt?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return src && !failed
    ? <img className="reward-thumb" src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} />
    : <span className="reward-image-fallback" aria-label="جايزة كروية"><Trophy size={22} /></span>;
}

function ReferralPanel({ user }: { user: any }) {
  const eligible = user?.role === "player" && user?.accountType === "player";
  const referral = api.referrals.me.useQuery(undefined, { enabled: Boolean(eligible), retry: false, refetchInterval: 10000, refetchOnWindowFocus: true, refetchOnReconnect: true });
  const track = api.referrals.track.useMutation();
  const code = referral.data?.code;
  const inviteUrl = code ? `${window.location.origin}/join?ref=${encodeURIComponent(code)}` : "";
  const template = String(referral.data?.campaign?.shareMessage || "أنا بلعب في البرازيلي، تعالى نلعب سوا!");
  const shareText = template.includes("{link}") ? template.replaceAll("{link}", inviteUrl) : `${template}\n${inviteUrl}`;
  const trackShare = () => {
    if (!code) return;
    void track.mutateAsync({ code, eventType: "share_attempt", clientEventId: referralEventId() }).catch(() => undefined);
  };
  const copyLink = async () => {
    if (!inviteUrl) return;
    trackShare();
    try { await navigator.clipboard.writeText(inviteUrl); toast.success("لينك دعوتك اتنسخ، ابعته لصاحبك اللي هيسجّل جديد!"); }
    catch { toast.error("حدد اللينك وانسخه يدوي، المشاركة مش هتدي نقط لوحدها."); }
  };
  const shareLink = async () => {
    if (!inviteUrl) return;
    trackShare();
    try {
      if (navigator.share) await navigator.share({ title: "دعوة من البرازيلي", text: shareText });
      else { await navigator.clipboard.writeText(shareText); toast.success("رسالة الدعوة اتنسخت، ابعتها لصاحبك."); }
    } catch (error: any) {
      if (error?.name !== "AbortError") toast.error("المشاركة ماكملتش. جرّب نسخ اللينك أو واتساب.");
    }
  };

  if (!eligible) return <section className="referral-share-card"><Users size={22} /><div><h2>دعوات اللاعبين</h2><p>الميزة دي لحسابات اللعيبة بس؛ حساب صاحب الملعب يقدر يتفرج على جوايزه من غير نظام الدعوات.</p></div></section>;
  return <section className="referral-share-card">
    <div className="referral-share-heading"><span className="referral-share-mark"><Share2 size={21} /></span><div><span className="eyebrow">لينكك الخاص</span><h2>لمّ أصحابك واكسب نقط</h2><p>شارك اللينك مع لاعب جديد؛ النقط بتتحسب لما يأكد إيميله ويكمّل بياناته، مش لمجرد الضغط أو النسخ.</p></div><span className={`status-chip ${referral.data?.campaign?.active ? "approved" : "pending"}`}>{referral.data?.campaign?.active ? "الحملة شغالة" : "الحملة واقفة"}</span></div>
    {referral.isLoading ? <div className="loading-line"><LoaderCircle className="spin" size={18} /> بنجهّز لينك دعوتك...</div> : referral.isError ? <div className="reward-load-error"><AlertCircle size={18} /><span>مش قادرين نجهّز لينك الدعوة دلوقتي. اتأكد من النت وجرّب تاني.</span><button className="button-outline compact-button" onClick={() => void referral.refetch()}><RefreshCw size={15} /> جرّب تاني</button></div> : <>
      <div className="referral-link-row"><input aria-label="لينك الدعوة" readOnly value={inviteUrl} onFocus={event => event.currentTarget.select()} /><button type="button" className="button-outline" onClick={() => void copyLink()}><Copy size={15} /> انسخ اللينك</button></div>
      <div className="referral-share-actions"><button type="button" className="button-primary" onClick={() => void shareLink()}><Share2 size={16} /> شارك الدعوة</button><a className="button-outline" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer" onClick={trackShare}><MessageCircle size={16} /> ابعتها واتساب</a></div>
      {!referral.data?.campaign?.active && <p className="referral-campaign-note">الحملة مش شغالة دلوقتي؛ تقدر تجهّز لينكك، بس النقط بتبدأ لما الإدارة تفتح الحملة.</p>}
      <div className="referral-metrics">{[["زيارات اللينك", referral.data?.counts?.visits || 0], ["محاولات المشاركة", referral.data?.counts?.shareAttempts || 0], ["حسابات اتسجلت", referral.data?.counts?.signups || 0], ["كملوا شروطهم", referral.data?.counts?.qualified || 0], ["مستنيين مراجعة", referral.data?.counts?.pending || 0], ["نقط كسبتها", referral.data?.counts?.pointsEarned || 0]].map(([label, value]) => <article key={String(label)}><small>{label}</small><strong>{Number(value).toLocaleString("ar-EG")}</strong></article>)}</div>
      {!Number(referral.data?.counts?.signups || 0) && Number(referral.data?.counts?.shareAttempts || 0) > 0 && <small className="referral-eligibility-note">المشاركة اتسجلت بنجاح، لكن مفيش حساب جديد اتربط بالدعوة لسه. النقاط هتظهر بعد ما لاعب جديد يفتح نفس اللينك ويسجل ويأكد إيميله ويكمل رقم الهاتف والمنطقة.</small>}
      {Number(referral.data?.counts?.pending || 0) > 0 && <small className="referral-eligibility-note">فيه دعوة مستنية اكتمال بيانات اللاعب الجديد أو مراجعة الإدارة؛ النظام بيحدّث الحالة تلقائيًا كل 10 ثواني.</small>}
      <small className="referral-eligibility-note">{Number(referral.data?.campaign?.profilePoints || 0).toLocaleString("ar-EG")} نقطة بعد تأكيد الإيميل واكتمال حساب صاحبك، و{Number(referral.data?.campaign?.firstQrBookingPoints || 0).toLocaleString("ar-EG")} نقطة إضافية بعد أول QR لحجز اتوافق عليه صاحب الملعب.</small>
    </>}
  </section>;
}

function PointsHistory({ history }: { history: any }) {
  const kindLabel: Record<string, string> = { earn: "مكسب", redeem: "استبدال جايزة", adjustment: "تعديل من الإدارة", refund: "استرداد" };
  const rows = history.data?.items || [];
  return <section className="reward-section"><div className="section-header"><div><h2>سجل حركة النقط</h2><p>كل زيادة أو خصم هتلاقيه متسجل هنا.</p></div><Ticket size={22} /></div>{history.isLoading ? <LoaderCircle className="spin" /> : history.isError ? <div className="reward-load-error"><AlertCircle size={18} /><span>سجل النقط مش ظاهر دلوقتي؛ حاول تاني بعد شوية.</span><button className="button-outline compact-button" onClick={() => void history.refetch()}><RefreshCw size={15} /> جرّب تاني</button></div> : rows.length ? <div className="points-history-list">{rows.map((item: any) => <article key={item.id}><div><b>{kindLabel[item.kind] || "حركة نقط"}</b><small>{item.note || "حركة على رصيدك"} · {dateText(item.createdAt)}</small></div><strong className={Number(item.amount) < 0 ? "negative" : "positive"}>{Number(item.amount) > 0 ? "+" : ""}{Number(item.amount).toLocaleString("ar-EG")} نقطة</strong></article>)}</div> : <div className="empty-state">لسه مفيش حركات على رصيدك.</div>}</section>;
}

function VoucherCard({ item, onClear }: { item: any; onClear: (id: number) => void }) {
  const [qr, setQr] = useState("");
  useEffect(() => { let alive = true; if (item.qrValue) QRCode.toDataURL(item.qrValue, { width: 260, margin: 2, color: { dark: "#09110d", light: "#ffffff" } }).then(value => { if (alive) setQr(value); }); return () => { alive = false; }; }, [item.qrValue]);
  const copy = async () => { try { await navigator.clipboard.writeText(item.backupCode); toast.success("الرمز الاحتياطي اتنسخ."); } catch { toast.error("انسخ الرمز من الكارت وجرّب تاني."); } };
  return <article className={`reward-voucher ${item.status !== "valid" ? "is-closed" : ""}`}><div className="reward-voucher-head"><RewardArt src={item.imageUrl} /><div><span className="eyebrow">قسيمة الجايزة رقم {item.id}</span><h2>{item.rewardName}</h2><small>{item.pointsCost} نقطة · صدرت {dateText(item.issuedAt)}</small></div><span className={`status-chip ${item.status === "valid" ? "approved" : "pending"}`}>{statusText[item.status] || item.status}</span></div><div className="reward-voucher-body"><div className="reward-qr-box">{qr ? <img src={qr} alt="رمز QR آمن للقسيمة" /> : <LoaderCircle className="spin" size={28} />}{item.status !== "valid" && <div className="qr-overlay"><X size={28} />{statusText[item.status]}</div>}</div><div className="reward-voucher-info"><p>{item.description || "جايزة كروية من البرازيلي."}</p><div className="reward-meta"><span>الجهة: {item.authorizedType === "pitch_owner" ? "صاحب الملعب" : item.authorizedType === "rewards_staff" ? "موظف الجوايز" : "إدارة البرازيلي"}</span><span>آخر موعد: {dateText(item.expiresAt)}</span></div><div className="backup-code"><small>الرمز الاحتياطي لو الكاميرا مش شغالة</small><b>{item.backupCode}</b><button type="button" onClick={() => void copy()} aria-label="انسخ الرمز"><Copy size={15} /></button></div>{item.terms && <small className="reward-terms">الشروط: {item.terms}</small>}{item.status !== "valid" && <button type="button" className="button-outline compact-button" onClick={() => onClear(Number(item.id))}>تنضيف QR القديم</button>}</div></div></article>;
}

export default function RewardsPage({ user }: { user: any }) {
  const [, setLocation] = useLocation();
  const balance = api.rewards.balance.useQuery(undefined, { enabled: Boolean(user), retry: false });
  const catalog = api.rewards.catalog.useQuery(undefined, { enabled: Boolean(user), retry: false });
  const history = api.rewards.history.useQuery(undefined, { enabled: Boolean(user), retry: false });
  const pointsHistory = api.rewards.pointsHistory.useQuery(undefined, { enabled: Boolean(user), retry: false });
  const redeem = api.rewards.redeem.useMutation({ onSuccess: async () => { await Promise.all([balance.refetch(), history.refetch(), pointsHistory.refetch()]); toast.success("الجايزة بقت بتاعتك! القسيمة جاهزة، ورّيها للجهة المكتوبة عليها."); }, onError: (error: any) => toast.error(error.message || "ماقدرناش نطلع قسيمة الجايزة، جرّب تاني.") });
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [hiddenVoucherIds, setHiddenVoucherIds] = useState<number[]>([]);
  if (!user) return <section className="panel-card"><ShieldCheck size={28} /><h2>سجّل دخولك عشان تشوف مكافآتك</h2><p>نقطك وقسايم الجوايز مربوطين بحسابك، ومش بيظهروا غير بعد التحقق.</p><button className="button-primary" onClick={() => setLocation("/join")}>سجّل دخولك <ArrowLeft size={16} /></button></section>;
  const allVouchers = history.data?.items || [];
  const vouchers = allVouchers.filter((item: any) => !hiddenVoucherIds.includes(Number(item.id)));
  const clearOldVouchers = () => setHiddenVoucherIds(allVouchers.filter((item: any) => item.status !== "valid").map((item: any) => Number(item.id)));
  const catalogItems = catalog.data?.items || [];
  const selectedReward = catalogItems.find((item: any) => Number(item.id) === confirmId);
  return <>
    <PageHeading eyebrow="المكافآت والدعوات" title="مكافآتك وجوايزك" description="تابع نقطك، استبدلها بجايزة، وشارك لينك دعوتك مع أصحابك." action={<button className="button-outline" onClick={() => setLocation("/verify-rewards")}><ShieldCheck size={16} /> تحقق الموظف</button>} />
    <section className="reward-balance-card"><div className="reward-balance-mark"><Wallet size={23} /></div><div><span>رصيد نقطك دلوقتي</span><strong>{balance.isLoading ? "بنحمّل…" : balance.isError ? "الرصيد مش ظاهر دلوقتي" : `${Number(balance.data?.balance || 0).toLocaleString("ar-EG")} نقطة`}</strong></div><small>{balance.isError ? <button type="button" className="text-link" onClick={() => void balance.refetch()}>جرّب تحميل الرصيد تاني</button> : "النقط بتتخصم مرة واحدة بس لما تستبدل الجايزة."}</small></section>
    <ReferralPanel user={user} />
    <section className="reward-section"><div className="section-header"><div><h2>الجوايز الكروية المتاحة</h2><p>اختار الجايزة اللي على مزاجك وعلى قد نقطك.</p></div><Trophy size={22} /></div><div className="reward-catalog">{catalog.isLoading ? <LoaderCircle className="spin" /> : catalog.isError ? <div className="reward-load-error"><AlertCircle size={18} /><span>مش قادرين نعرض الجوايز دلوقتي. جرّب تاني بعد ما تتأكد إن النت شغال.</span><button type="button" className="button-outline compact-button" onClick={() => void catalog.refetch()}><RefreshCw size={15} /> جرّب تاني</button></div> : catalogItems.map((item: any) => <article className="reward-catalog-card" key={item.id}><RewardArt src={item.imageUrl} alt={`صورة جايزة ${item.name}`} /><div><h3>{item.name}</h3><p>{item.description || "جايزة حصرية للاعبي البرازيلي."}</p><b>{Number(item.costPoints).toLocaleString("ar-EG")} نقطة</b></div><button className="button-primary" onClick={() => setConfirmId(Number(item.id))} disabled={redeem.isPending || Number(balance.data?.balance || 0) < item.costPoints}>استبدل الجايزة</button></article>)}{!catalog.isLoading && !catalog.isError && !catalogItems.length && <p className="muted">مفيش جوايز متاحة دلوقتي، ارجع لنا كمان شوية.</p>}</div></section>
    <section className="reward-section"><div className="section-header"><div><h2>قسائم جوايزك</h2><p>ورّي القسيمة للجهة المكتوبة عليها عشان تستلم الجايزة.</p></div><div className="section-header-actions"><button type="button" className="button-outline compact-button" onClick={clearOldVouchers}>تنضيف القسايم القديمة</button><Ticket size={22} /></div></div><div className="reward-voucher-list">{history.isLoading ? <LoaderCircle className="spin" /> : history.isError ? <div className="reward-load-error"><AlertCircle size={18} /><span>مش قادرين نجيب قسايمك دلوقتي. مفيش حاجة ضاعت؛ جرّب تحميلها تاني.</span><button type="button" className="button-outline compact-button" onClick={() => void history.refetch()}><RefreshCw size={15} /> حمّل القسايم</button></div> : vouchers.map((item: any) => <VoucherCard item={item} onClear={id => setHiddenVoucherIds(current => current.includes(id) ? current : [...current, id])} key={item.id} />)}{!history.isLoading && !history.isError && !vouchers.length && <div className="empty-state"><Ticket size={25} /><h3>لسه ماطلعتش قسيمة</h3><p>استبدل نقطك من الجوايز المتاحة، وهتلاقي قسيمتك هنا.</p></div>}</div></section>
    <PointsHistory history={pointsHistory} />
    {confirmId && <div className="reward-modal-backdrop"><div className="reward-modal"><button className="icon-button" onClick={() => setConfirmId(null)} aria-label="اقفل"><X /></button><div className="reward-modal-heading"><Trophy size={23} /><span>جايزة كروية</span></div><h2>تأكيد استبدال الجايزة</h2><p>{selectedReward ? `هتستبدل «${selectedReward.name}» بـ${Number(selectedReward.costPoints).toLocaleString("ar-EG")} نقطة.` : "هنخصم تكلفة الجايزة من رصيدك."} هتطلعلك قسيمة QR ورمز احتياطي، وتستخدمهم مرة واحدة عند الجهة المكتوبة على القسيمة.</p><button className="button-primary full-button" onClick={() => { void redeem.mutateAsync({ rewardId: confirmId }).then(() => setConfirmId(null)); }} disabled={redeem.isPending}>{redeem.isPending ? <LoaderCircle className="spin" /> : <><Check size={17} /> أيوه، استبدل الجايزة</>}</button></div></div>}
  </>;
}
