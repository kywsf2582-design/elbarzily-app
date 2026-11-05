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
  return <label className="form-field"><span>{label}</span><div className="field-control">{Icon && <Icon size={17} className="field-icon" />}<input type={secret && visible ? "text" : type} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} required={required} autoComplete={autoComplete} />{secret && <button type="button" className="field-reveal" onClick={() => setVisible(v => !v)} aria-label={visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button>}</div></label>;
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
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();
  const api = trpc as any;
  const loginMutation = api.auth.login.useMutation();
  const requestOtpMutation = api.auth.requestOtp.useMutation();
  const registerMutation = api.auth.register.useMutation();
  const requestPasswordResetMutation = api.auth.requestPasswordReset.useMutation();
  const resetPasswordMutation = api.auth.resetPassword.useMutation();

  const finish = async (data?: any) => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await utils.auth.me.invalidate();
    const account = data?.user ?? data;
    const ownerAccount = account?.accountType === "owner" || account?.role === "owner";
    const destination = ownerAccount ? "/owner" : "/";
    const next = new URLSearchParams(location.split("?")[1] ?? "").get("next");
    if (next && /^(?:\/|\/profile(?:\?booking=[1-9]\d*)?)$/.test(next)) setLocation(next);
    toast.success(ownerAccount ? "تم إنشاء حساب صاحب الملعب. اختر باقتك لإرسال طلب التفعيل." : "أهلاً بك في البرازيلي!");
    afterLogin?.();
    if (!next || !/^(?:\/|\/profile(?:\?booking=[1-9]\d*)?)$/.test(next)) setLocation(destination);
  };

  const onLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true);
    try { const result = await loginMutation.mutateAsync({ email: email.trim(), password }); await finish(result?.user ?? result); }
    catch (error: any) { toast.error(error?.message || "تعذر تسجيل الدخول. تحقق من بياناتك."); }
    finally { setBusy(false); }
  };

  const sendRegistrationCode = async () => {
    setBusy(true);
    try { await requestOtpMutation.mutateAsync({ email: email.trim(), name: name.trim(), purpose: "register" }); setMode("verify"); toast.success("أرسلنا رمز التحقق إلى بريدك الإلكتروني."); }
    catch (error: any) { toast.error(error?.message || "تعذر إرسال رمز التحقق. تحقق من إعداد البريد."); }
    finally { setBusy(false); }
  };
  const requestCode = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); await sendRegistrationCode(); };

  const onRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true);
    try { const result = await registerMutation.mutateAsync({ name: name.trim(), email: email.trim(), password, phone: phone.trim() || undefined, region: region.trim() || undefined, accountType: role, otp: code.trim() }); await finish(result?.user ?? result); }
    catch (error: any) { toast.error(error?.message || "تعذر تفعيل الحساب. تحقق من الرمز وحاول مرة أخرى."); }
    finally { setBusy(false); }
  };

  const requestReset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true);
    try { await requestPasswordResetMutation.mutateAsync({ email: email.trim() }); setMode("reset"); toast.success("إذا كان البريد مسجلاً، سيصلك رمز إعادة التعيين."); }
    catch (error: any) { toast.error(error?.message || "تعذر إرسال رمز إعادة التعيين."); }
    finally { setBusy(false); }
  };

  const resetPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true);
    try { await resetPasswordMutation.mutateAsync({ email: email.trim(), otp: code.trim(), password }); setMode("login"); setPassword(""); toast.success("تم تحديث كلمة المرور. يمكنك تسجيل الدخول الآن."); }
    catch (error: any) { toast.error(error?.message || "تعذر تغيير كلمة المرور. تحقق من الرمز."); }
    finally { setBusy(false); }
  };

  const backToLogin = () => { setMode("login"); setCode(""); };
  const HeadingIcon = mode === "login" ? ShieldCheck : mode === "reset" || mode === "forgot" ? KeyRound : mode === "choose-role" ? UserRound : Mail;

  return <section className="auth-layout">
    <div className="auth-visual">
      <div className="auth-image" />
      <div className="auth-visual-content"><span className="live-pill"><span /> وقت اللعب</span><h2>الملعب<br /><em>يناديك.</em></h2><p>احجز ملعبك، لمّ أصحابك، وخلي المباراة تبدأ.</p><div className="auth-visual-stat"><span className="stat-icon">⚽</span><span><b>كل مباراة لها بداية</b><small>ابدأها من البرازيلي</small></span></div></div>
      <div className="field-lines" aria-hidden="true"><i /><i /><i /></div>
    </div>
    <div className="auth-panel">
          {mode !== "choose-role" && <button className="back-link" onClick={() => setLocation("/")}><ArrowRight size={16} /> العودة للرئيسية</button>}
          <div className="auth-title-icon"><HeadingIcon size={21} /></div>
      {mode === "choose-role" && <>
        <div className="auth-heading"><span className="eyebrow">ابدأ من هنا</span><h1>هتلعب ولا هتدير ملعب؟</h1><p>اختار نوع حسابك، ونفتح لك التسجيل المناسب على طول.</p></div>
        <div className="role-picker"><button type="button" onClick={() => { setRole("player"); setMode("register"); }}><span className="role-symbol">⚽</span><span><b>التسجيل كلاعب</b><small>احجز ملعبك وانضم للمباريات</small></span><ArrowLeft size={17} /></button><button type="button" onClick={() => { setRole("owner"); setMode("register"); }}><span className="role-symbol">🏟</span><span><b>التسجيل كصاحب ملعب</b><small>أدر ملعبك ومواعيدك وطلبات الحجز</small></span><ArrowLeft size={17} /></button></div>
        <p className="auth-switch">عندك حساب بالفعل؟ <button onClick={() => setMode("login")}>سجّل دخولك</button></p>
      </>}
      {mode === "login" && <>
        <div className="auth-heading"><span className="eyebrow">حسابك في الملعب</span><h1>أهلاً بعودتك</h1><p>سجّل دخولك وكمل من آخر مباراة.</p></div>
        <form onSubmit={onLogin} className="form-stack"><Field label="البريد الإلكتروني" icon={AtSign} type="email" value={email} onChange={setEmail} placeholder="name@example.com" required autoComplete="email" /><Field label="كلمة المرور" icon={LockKeyhole} type="password" value={password} onChange={setPassword} placeholder="••••••••" required autoComplete="current-password" /><div className="form-inline"><span /><button type="button" className="quiet-link" onClick={() => setMode("forgot")}>نسيت كلمة المرور؟</button></div><button className="button-primary auth-submit" disabled={busy || loginMutation.isPending}>{busy || loginMutation.isPending ? <LoaderCircle size={18} className="spin" /> : <><span>تسجيل الدخول</span><ArrowLeft size={17} /></>}</button></form>
        <p className="auth-switch">ما عندك حساب؟ <button onClick={() => setMode("choose-role")}>أنشئ حساباً جديداً</button></p>
      </>}
      {mode === "register" && <>
        <div className="auth-heading"><span className="eyebrow">{role === "player" ? "حساب لاعب" : "حساب صاحب ملعب"}</span><h1>{role === "player" ? "سجّل كلاعب" : "سجّل كصاحب ملعب"}</h1><p>{role === "player" ? "أنشئ حسابك واحجز وانضم للمباريات." : "أنشئ حسابك ثم أرسل بيانات ملعبك للإدارة."}</p></div>
        <form onSubmit={requestCode} className="form-stack"><Field label="الاسم الكامل" icon={UserRound} value={name} onChange={setName} placeholder="اكتب اسمك" required autoComplete="name" /><Field label="البريد الإلكتروني" icon={AtSign} type="email" value={email} onChange={setEmail} placeholder="name@example.com" required autoComplete="email" />{role === "player" && <><Field label="رقم الهاتف" value={phone} onChange={setPhone} placeholder="01X XXXX XXXX" required autoComplete="tel" /><Field label="المنطقة" value={region} onChange={setRegion} placeholder="مثال: مدينة نصر" required /></>}<Field label="كلمة المرور" icon={LockKeyhole} type="password" value={password} onChange={setPassword} placeholder="8 أحرف على الأقل" required autoComplete="new-password" /><button className="button-primary auth-submit" disabled={busy || requestOtpMutation.isPending}>{busy || requestOtpMutation.isPending ? <LoaderCircle size={18} className="spin" /> : <><span>أرسل رمز التفعيل</span><ArrowLeft size={17} /></>}</button></form>
        <button className="auth-back" onClick={() => setMode("choose-role")}><ChevronLeft size={15} /> تغيير نوع الحساب</button><p className="auth-switch">عندك حساب بالفعل؟ <button onClick={() => setMode("login")}>سجّل دخولك</button></p>
      </>}
      {mode === "verify" && <>
        <div className="auth-heading"><span className="eyebrow">تأكيد البريد</span><h1>باقي خطوة</h1><p>أدخل الرمز المكوّن من 6 أرقام الذي أرسلناه إلى <bdi>{email}</bdi>.</p></div>
        <form onSubmit={onRegister} className="form-stack"><Field label="رمز التحقق" icon={KeyRound} value={code} onChange={value => setCode(value.replace(/\D/g, "").slice(0, 6))} placeholder="٠ ٠ ٠ ٠ ٠ ٠" required /><button className="button-primary auth-submit" disabled={busy || registerMutation.isPending || code.length !== 6}>{busy || registerMutation.isPending ? <LoaderCircle size={18} className="spin" /> : <><span>تأكيد وإنشاء الحساب</span><ArrowLeft size={17} /></>}</button></form><button type="button" className="quiet-link resend-link" disabled={busy || requestOtpMutation.isPending} onClick={sendRegistrationCode}>إعادة إرسال الرمز</button><button className="auth-back" onClick={() => setMode("register")}><ChevronLeft size={15} /> تعديل البيانات</button>
      </>}
      {mode === "forgot" && <>
        <div className="auth-heading"><span className="eyebrow">استعادة الحساب</span><h1>نسيت كلمة المرور؟</h1><p>اكتب بريدك الإلكتروني وسنرسل لك رمز استعادة من 6 أرقام.</p></div>
        <form onSubmit={requestReset} className="form-stack"><Field label="البريد الإلكتروني" icon={AtSign} type="email" value={email} onChange={setEmail} placeholder="name@example.com" required /><button className="button-primary auth-submit" disabled={busy || requestPasswordResetMutation.isPending}>{busy || requestPasswordResetMutation.isPending ? <LoaderCircle size={18} className="spin" /> : <><span>إرسال رمز الاستعادة</span><ArrowLeft size={17} /></>}</button></form><button className="auth-back" onClick={backToLogin}><ChevronLeft size={15} /> العودة لتسجيل الدخول</button>
      </>}
      {mode === "reset" && <>
        <div className="auth-heading"><span className="eyebrow">استعادة الحساب</span><h1>اختر كلمة مرور جديدة</h1><p>أدخل الرمز الذي أرسلناه إلى <bdi>{email}</bdi> ثم عيّن كلمة المرور.</p></div>
        <form onSubmit={resetPassword} className="form-stack"><Field label="رمز التحقق" icon={KeyRound} value={code} onChange={value => setCode(value.replace(/\D/g, "").slice(0, 6))} placeholder="٠ ٠ ٠ ٠ ٠ ٠" required /><Field label="كلمة المرور الجديدة" icon={LockKeyhole} type="password" value={password} onChange={setPassword} placeholder="8 أحرف على الأقل" required autoComplete="new-password" /><button className="button-primary auth-submit" disabled={busy || resetPasswordMutation.isPending}>{busy || resetPasswordMutation.isPending ? <LoaderCircle size={18} className="spin" /> : <><span>حفظ كلمة المرور</span><ArrowLeft size={17} /></>}</button></form><button className="auth-back" onClick={backToLogin}><ChevronLeft size={15} /> العودة لتسجيل الدخول</button>
      </>}
      <div className="auth-secure"><LockKeyhole size={13} /><span>بياناتك محمية ومشفرة</span></div>
    </div>
  </section>;
}
