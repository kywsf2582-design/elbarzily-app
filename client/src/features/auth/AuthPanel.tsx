import { useState } from "react";
import { ArrowLeft, ArrowRight, AtSign, Check, ChevronLeft, Eye, EyeOff, KeyRound, LoaderCircle, LockKeyhole, Mail, ShieldCheck, UserRound } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useQueryClient } from "@tanstack/react-query";

type AuthMode = "choose-role" | "login" | "register" | "verify" | "forgot" | "reset";
type UserRole = "player" | "owner";

function Field({ label, icon: Icon, type = "text", value, onChange, placeholder, required = false, autoComplete }: { label: string; icon?: typeof Mail; type?: string; value: string; onChange: (value: string) => void; placeholder?: string; required?: boolean; autoComplete?: string }) {
  const [visible, setVisible] = useState(false);
  const secret = type === "password";
  return <label className="form-field"><span>{label}</span><div className="field-control">{Icon && <Icon size={17} className="field-icon" />}<input type={secret && visible ? "text" : type} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} required={required} autoComplete={autoComplete} />{secret && <button type="button" className="field-reveal" onClick={() => setVisible(v => !v)} aria-label={visible ? "خبّي كلمة السر" : "ورّيني كلمة السر"}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button>}</div></label>;
}

export default function AuthPanel({ afterLogin, initialMode = "login" }: { afterLogin?: () => void; initialMode?: AuthMode }) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [role, setRole] = useState<UserRole>("player");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [region, setRegion] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [location, setLocation] = useLocation();
  const [referralCode, setReferralCode] = useState(() => {
    const fromUrl = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("ref")?.trim().toUpperCase() || "";
    const validFromUrl = /^[A-F0-9]{12}$/.test(fromUrl) ? fromUrl : "";
    try {
      if (validFromUrl) window.sessionStorage.setItem("brzly-referral-code", validFromUrl);
      const saved = window.sessionStorage.getItem("brzly-referral-code")?.trim().toUpperCase() || "";
      return validFromUrl || (/^[A-F0-9]{12}$/.test(saved) ? saved : "");
    } catch { return validFromUrl; }
  });
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();
  const api = trpc as any;
  const loginMutation = api.auth.login.useMutation();
  const requestOtpMutation = api.auth.requestOtp.useMutation();
  const registerMutation = api.auth.register.useMutation();
  const requestPasswordResetMutation = api.auth.requestPasswordReset.useMutation();
  const resetPasswordMutation = api.auth.resetPassword.useMutation();
  const ownerSubscriptionOffer = api.subscriptions.plans.useQuery(undefined, { retry: false, staleTime: 60_000 });
  const freeTrialOffer = (ownerSubscriptionOffer.data as any)?.freeTrialEnabled === true;
  const freeTrialDays = Number((ownerSubscriptionOffer.data as any)?.freeTrialDays || 30);

  const finish = async (data?: any) => {
    await queryClient.cancelQueries();
    const account = data?.user ?? data;
    if (account) utils.auth.me.setData(undefined, account);
    // Do not block a successful login on a second background auth request.
    // A transient/non-JSON response from the proxy must not turn login into an error.
    void utils.auth.me.invalidate().catch(() => undefined);
    const ownerAccount = account?.accountType === "owner" || account?.role === "owner";
    const destination = ownerAccount ? "/owner" : "/";
    const next = new URLSearchParams(location.split("?")[1] ?? "").get("next");
    if (next && /^(?:\/|\/profile(?:\?booking=[1-9]\d*)?)$/.test(next)) setLocation(next);
    toast.success(ownerAccount ? "حساب صاحب الملعب اتعمل. اختار باقتك عشان تبعت طلب التفعيل." : "نورت البرازيلي يا بطل!");
    afterLogin?.();
    if (!next || !/^(?:\/|\/profile(?:\?booking=[1-9]\d*)?)$/.test(next)) setLocation(destination);
  };

  const onLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true);
    try { const result = await loginMutation.mutateAsync({ email: email.trim(), password }); await finish(result?.user ?? result); }
    catch (error: any) { toast.error(error?.message || "مش قادرين ندخّلك. راجع بياناتك وحاول تاني."); }
    finally { setBusy(false); }
  };

  const sendRegistrationCode = async () => {
    setBusy(true);
    try { await requestOtpMutation.mutateAsync({ email: email.trim(), name: name.trim(), purpose: "register" }); setMode("verify"); toast.success("بعتنالك رمز التأكيد على إيميلك."); }
    catch (error: any) { toast.error(error?.message || "ماقدرناش نبعت رمز التأكيد. راجع الإيميل وجرّب تاني."); }
    finally { setBusy(false); }
  };
  const requestCode = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); await sendRegistrationCode(); };

  const onRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true);
    try {
      const result = await registerMutation.mutateAsync({ name: name.trim(), email: email.trim(), password, phone: phone.trim() || undefined, region: region.trim() || undefined, accountType: role, otp: code.trim(), ...(role === "player" && referralCode ? { referralCode } : {}) });
      try { window.sessionStorage.removeItem("brzly-referral-code"); } catch { /* The account has already been created. */ }
      setReferralCode("");
      await finish(result?.user ?? result);
    }
    catch (error: any) { toast.error(error?.message || "ماقدرناش نفعّل الحساب. راجع الرمز وجرّب تاني."); }
    finally { setBusy(false); }
  };

  const requestReset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true);
    try { await requestPasswordResetMutation.mutateAsync({ email: email.trim() }); setMode("reset"); toast.success("بعتنالك رمز تغيير كلمة السر على إيميلك."); }
    catch (error: any) {
      toast.error(error?.message || "ماقدرناش نبعت رمز تغيير كلمة السر، جرّب تاني.");
      if (error?.data?.code === "NOT_FOUND") setMode("choose-role");
    }
    finally { setBusy(false); }
  };

  const resetPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true);
    try { await resetPasswordMutation.mutateAsync({ email: email.trim(), otp: code.trim(), password }); setMode("login"); setPassword(""); toast.success("كلمة السر اتحدّثت، يلا ادخل لحسابك."); }
    catch (error: any) { toast.error(error?.message || "ماقدرناش نغيّر كلمة السر. راجع الرمز وجرّب تاني."); }
    finally { setBusy(false); }
  };

  const backToLogin = () => { setMode("login"); setCode(""); };
  const HeadingIcon = mode === "login" ? ShieldCheck : mode === "reset" || mode === "forgot" ? KeyRound : mode === "choose-role" ? UserRound : Mail;

  return <section className="auth-layout">
    <div className="auth-visual">
      <div className="auth-image" />
      <div className="auth-visual-content"><span className="live-pill"><span /> وقت اللعب</span><h2>الملعب<br /><em>بيناديك.</em></h2><p>احجز ملعبك، لمّ أصحابك، وخلي الماتش يبدأ.</p><div className="auth-visual-stat"><span className="stat-icon">⚽</span><span><b>كل ماتش ليه بداية</b><small>ابدأها من البرازيلي</small></span></div></div>
      <div className="field-lines" aria-hidden="true"><i /><i /><i /></div>
    </div>
    <div className="auth-panel">
          {mode !== "choose-role" && <button className="back-link" onClick={() => setLocation("/")}><ArrowRight size={16} /> ارجع للرئيسية</button>}
          <div className="auth-title-icon"><HeadingIcon size={21} /></div>
      {mode === "choose-role" && <>
        <div className="auth-heading"><span className="eyebrow">ابدأ من هنا</span><h1>هتلعب ولا هتدير ملعب؟</h1><p>اختار نوع حسابك ونكمّل سوا على طول.</p></div>
        <div className="role-picker"><button type="button" onClick={() => { setRole("player"); setMode("register"); }}><span className="role-symbol">⚽</span><span><b>سجّل كلاعب</b><small>انضم للماتشات</small></span><ArrowLeft size={17} /></button><button type="button" onClick={() => { setRole("owner"); setMode("register"); }}><span className="role-symbol">🏟</span><span><b>سجّل كصاحب ملعب</b><small>{freeTrialOffer ? `تجربة مجانية ${freeTrialDays} يوم` : "دير ملاعبك"}</small></span><ArrowLeft size={17} /></button></div>
        <p className="auth-switch">عندك حساب بالفعل؟ <button onClick={() => setMode("login")}>سجّل دخولك</button></p>
      </>}
      {mode === "login" && <>
        <div className="auth-heading"><span className="eyebrow">حسابك في الملعب</span><h1>نورت تاني يا نجم</h1><p>كمّل من آخر ماتش.</p></div>
        <form onSubmit={onLogin} className="form-stack"><Field label="البريد الإلكتروني" icon={AtSign} type="email" value={email} onChange={setEmail} placeholder="name@example.com" required autoComplete="email" /><Field label="كلمة السر" icon={LockKeyhole} type="password" value={password} onChange={setPassword} placeholder="••••••••" required autoComplete="current-password" /><div className="form-inline"><span /><button type="button" className="quiet-link" onClick={() => setMode("forgot")}>نسيت كلمة السر؟</button></div><div className="auth-field-security"><LockKeyhole size={13} /><span>اطمّن، بياناتك محمية ومشفّرة.</span></div><button className="button-primary auth-submit" disabled={busy || loginMutation.isPending}>{busy || loginMutation.isPending ? <LoaderCircle size={18} className="spin" /> : <><span>ادخل على حسابك</span><ArrowLeft size={17} /></>}</button></form>
        <p className="auth-switch">ما عندك حساب؟ <button onClick={() => setMode("choose-role")}>اعمل حساب جديد</button></p>
      </>}
      {mode === "register" && <>
        <div className="auth-heading"><span className="eyebrow">{role === "player" ? "حساب لاعب" : "حساب صاحب ملعب"}</span><h1>{role === "player" ? "سجّل كلاعب" : "سجّل كصاحب ملعب"}</h1><p>{role === "player" ? "اعمل حسابك واحجز وانضم للماتشات." : "اعمل حسابك وبعدها ابعت بيانات ملعبك للإدارة."}</p></div>{role === "owner" && freeTrialOffer && <div className="free-trial-offer"><b>عرض للكباتن الجدد</b><span>سجّل دلوقتي وخد اشتراك مجاني لمدة {freeTrialDays} يوم، من غير دفع أو رفع إيصال.</span></div>}
        <form onSubmit={requestCode} className="form-stack"><Field label="اسمك بالكامل" icon={UserRound} value={name} onChange={setName} placeholder="اكتب اسمك" required autoComplete="name" /><Field label="البريد الإلكتروني" icon={AtSign} type="email" value={email} onChange={setEmail} placeholder="name@example.com" required autoComplete="email" />{role === "player" && <><Field label="رقم الهاتف" value={phone} onChange={setPhone} placeholder="01X XXXX XXXX" required autoComplete="tel" /><Field label="المنطقة" value={region} onChange={setRegion} placeholder="مثال: مدينة نصر" required /></>}<Field label="كلمة السر" icon={LockKeyhole} type="password" value={password} onChange={setPassword} placeholder="8 حروف أو أكتر" required autoComplete="new-password" /><div className="auth-field-security"><LockKeyhole size={13} /><span>اطمّن، بياناتك محمية ومشفّرة.</span></div><button className="button-primary auth-submit" disabled={busy || requestOtpMutation.isPending}>{busy || requestOtpMutation.isPending ? <LoaderCircle size={18} className="spin" /> : <><span>ابعت رمز التفعيل</span><ArrowLeft size={17} /></>}</button></form>
        <button className="auth-back" onClick={() => setMode("choose-role")}><ChevronLeft size={15} /> غيّر نوع الحساب</button><p className="auth-switch">عندك حساب بالفعل؟ <button onClick={() => setMode("login")}>سجّل دخولك</button></p>
      </>}
      {mode === "verify" && <>
        <div className="auth-heading"><span className="eyebrow">تأكيد البريد</span><h1>فاضل خطوة</h1><p>اكتب الرمز اللي بعتناه على <bdi>{email}</bdi>.</p></div>
        <form onSubmit={onRegister} className="form-stack"><Field label="رمز التحقق" icon={KeyRound} value={code} onChange={value => setCode(value.replace(/\D/g, "").slice(0, 6))} placeholder="٠ ٠ ٠ ٠ ٠ ٠" required /><div className="auth-field-security"><LockKeyhole size={13} /><span>اطمّن، بياناتك محمية ومشفّرة.</span></div><button className="button-primary auth-submit" disabled={busy || registerMutation.isPending || code.length !== 6}>{busy || registerMutation.isPending ? <LoaderCircle size={18} className="spin" /> : <><span>أكد واعمل حسابك</span><ArrowLeft size={17} /></>}</button></form><button type="button" className="quiet-link resend-link" disabled={busy || requestOtpMutation.isPending} onClick={sendRegistrationCode}>ابعت الرمز تاني</button><button className="auth-back" onClick={() => setMode("register")}><ChevronLeft size={15} /> عدّل بياناتك</button>
      </>}
      {mode === "forgot" && <>
        <div className="auth-heading"><span className="eyebrow">استعادة الحساب</span><h1>نسيت كلمة السر؟</h1><p>اكتب بريدك الإلكتروني وهنبعتلك رمز استعادة من 6 أرقام.</p></div>
        <form onSubmit={requestReset} className="form-stack"><Field label="البريد الإلكتروني" icon={AtSign} type="email" value={email} onChange={setEmail} placeholder="name@example.com" required /><div className="auth-field-security"><LockKeyhole size={13} /><span>اطمّن، بياناتك محمية ومشفّرة.</span></div><button className="button-primary auth-submit" disabled={busy || requestPasswordResetMutation.isPending}>{busy || requestPasswordResetMutation.isPending ? <LoaderCircle size={18} className="spin" /> : <><span>ابعت رمز الاستعادة</span><ArrowLeft size={17} /></>}</button></form><button className="auth-back" onClick={backToLogin}><ChevronLeft size={15} /> ارجع لتسجيل الدخول</button>
      </>}
      {mode === "reset" && <>
        <div className="auth-heading"><span className="eyebrow">استعادة الحساب</span><h1>اختار كلمة سر جديدة</h1><p>اكتب الرمز اللي بعتناه على <bdi>{email}</bdi> وبعدها اختار كلمة سر جديدة.</p></div>
        <form onSubmit={resetPassword} className="form-stack"><Field label="رمز التحقق" icon={KeyRound} value={code} onChange={value => setCode(value.replace(/\D/g, "").slice(0, 6))} placeholder="٠ ٠ ٠ ٠ ٠ ٠" required /><Field label="كلمة السر الجديدة" icon={LockKeyhole} type="password" value={password} onChange={setPassword} placeholder="8 حروف أو أكتر" required autoComplete="new-password" /><div className="auth-field-security"><LockKeyhole size={13} /><span>اطمّن، بياناتك محمية ومشفّرة.</span></div><button className="button-primary auth-submit" disabled={busy || resetPasswordMutation.isPending}>{busy || resetPasswordMutation.isPending ? <LoaderCircle size={18} className="spin" /> : <><span>حفظ كلمة السر</span><ArrowLeft size={17} /></>}</button></form><button className="auth-back" onClick={backToLogin}><ChevronLeft size={15} /> ارجع لتسجيل الدخول</button>
      </>}
      {mode === "choose-role" && <div className="auth-secure"><LockKeyhole size={13} /><span>اطمّن، بياناتك محمية ومشفّرة.</span></div>}
    </div>
  </section>;
}
