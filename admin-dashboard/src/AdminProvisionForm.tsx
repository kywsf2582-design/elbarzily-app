import React, { useState } from "react";
import { permissionOptions, type PermissionId } from "./permissions";

type ModeratorRole = "moderator" | "admin";
export type CreateAdminInput = { name: string; email: string; password: string; role: ModeratorRole; permissions: PermissionId[] };
export type LinkAdminInput = { email: string; role: ModeratorRole; permissions: PermissionId[] };

type Props = {
  onCreate: (input: CreateAdminInput) => Promise<void>;
  onLinkExisting: (input: LinkAdminInput) => Promise<void>;
};

export default function AdminProvisionForm({ onCreate, onLinkExisting }: Props) {
  const [mode, setMode] = useState<"link" | "create">("link");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<ModeratorRole>("moderator");
  const [permissions, setPermissions] = useState<PermissionId[]>(["users", "support"]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const togglePermission = (permission: PermissionId) => {
    setPermissions(current => current.includes(permission)
      ? current.filter(item => item !== permission)
      : [...current, permission]);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (mode === "link") {
        await onLinkExisting({ email: normalizedEmail, role, permissions });
        setMessage({ kind: "success", text: "الحساب الموجود اتربط. بيانات الدخول والحساب ما اتغيروش." });
      } else {
        await onCreate({ name: name.trim(), email: normalizedEmail, password, role, permissions });
        setMessage({ kind: "success", text: "حساب المشرف الجديد اتعمل." });
        setName("");
        setPassword("");
      }
      setEmail("");
    } catch (error) {
      const errorText = error instanceof Error ? error.message : "ماقدرناش نحفظ بيانات المشرف، جرّب تاني.";
      if (mode === "create" && /مسجل بالفعل|already registered/i.test(errorText)) {
        setMode("link");
        setEmail(current => current.trim().toLowerCase());
        setName("");
        setPassword("");
        setMessage({ kind: "error", text: "الإيميل ده ليه حساب بالفعل. غيّرنا النموذج لـ«ربط حساب موجود»؛ دوس «اربط الحساب وضيف الصلاحيات» عشان تكمل، وبيانات الحساب هتفضل زي ما هي." });
      } else {
        setMessage({ kind: "error", text: errorText });
      }
    } finally {
      setBusy(false);
    }
  };

  return <form className="create-card admin-provision-card" onSubmit={submit}>
    <span className="overline">إعداد صلاحيات الدخول</span>
    <h3>إدارة صلاحيات المشرفين</h3>
    <div className="admin-provision-tabs" role="tablist" aria-label="طريقة إضافة المشرف">
      <button type="button" role="tab" aria-selected={mode === "link"} className={mode === "link" ? "selected" : ""} onClick={() => { setMode("link"); setMessage(null); }}>ربط حساب موجود</button>
      <button type="button" role="tab" aria-selected={mode === "create"} className={mode === "create" ? "selected" : ""} onClick={() => { setMode("create"); setMessage(null); }}>إنشاء حساب جديد</button>
    </div>
    <p className="admin-provision-hint">{mode === "link"
      ? "اربط حساب لاعب موجود بالفعل. الإيميل والاسم وكلمة السر ونوع الحساب وحالة الإيقاف هيفضلوا زي ما هم."
      : "اعمل حساب دخول جديد للمشرف؛ هيستخدم الإيميل ده في تسجيل الدخول والتحقق."}</p>
    {mode === "create" && <label>اسم المشرف بالكامل<input value={name} onChange={event => setName(event.target.value)} autoComplete="name" minLength={2} maxLength={160} required /></label>}
    <label>إيميل المشرف<input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" placeholder="moderator@example.com" maxLength={320} required /><small>{mode === "link" ? "استخدم نفس الإيميل المسجل في الحساب الموجود." : "استخدم إيميل المشرف نفسه، مش إيميل المدير اللي بيعمل الحساب."}</small></label>
    {mode === "create" && <label>كلمة سر حساب المشرف<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" minLength={8} maxLength={128} required /></label>}
    <label>الدور<select value={role} onChange={event => setRole(event.target.value as ModeratorRole)}><option value="moderator">مشرف بصلاحيات محددة</option><option value="admin">مدير</option></select></label>
    <fieldset className="admin-scope-fieldset"><legend>صلاحيات الوصول</legend><div className="permission-picker">{permissionOptions.map(([id, label]) => <label key={id}><input type="checkbox" checked={permissions.includes(id)} onChange={() => togglePermission(id)} />{label}</label>)}</div></fieldset>
    {message && <p className={`admin-provision-message ${message.kind}`} role={message.kind === "error" ? "alert" : "status"}>{message.text}</p>}
    <button className="gold-button" disabled={busy}>{busy ? "بيتحفظ…" : mode === "link" ? "اربط الحساب وضيف الصلاحيات" : "إنشاء حساب المشرف"}</button>
  </form>;
}
