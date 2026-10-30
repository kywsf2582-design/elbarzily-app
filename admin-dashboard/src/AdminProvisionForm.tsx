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
  const [permissions, setPermissions] = useState<PermissionId[]>(["users", "chats"]);
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
        setMessage({ kind: "success", text: "تم ربط الحساب الموجود. لم تتغير بيانات الدخول أو بيانات الحساب." });
      } else {
        await onCreate({ name: name.trim(), email: normalizedEmail, password, role, permissions });
        setMessage({ kind: "success", text: "تم إنشاء حساب المشرف الجديد." });
        setName("");
        setPassword("");
      }
      setEmail("");
    } catch (error) {
      const errorText = error instanceof Error ? error.message : "تعذر حفظ المشرف.";
      if (mode === "create" && /مسجل بالفعل|already registered/i.test(errorText)) {
        setMode("link");
        setEmail(current => current.trim().toLowerCase());
        setName("");
        setPassword("");
        setMessage({ kind: "error", text: "هذا البريد له حساب بالفعل. حُوّل النموذج إلى «ربط حساب مسجل»؛ اضغط «ربط الحساب ومنح الصلاحيات» لإكمال الربط مع إبقاء بيانات الحساب كما هي." });
      } else {
        setMessage({ kind: "error", text: errorText });
      }
    } finally {
      setBusy(false);
    }
  };

  return <form className="create-card admin-provision-card" onSubmit={submit}>
    <span className="overline">ACCESS PROVISIONING</span>
    <h3>إدارة وصول المشرفين</h3>
    <div className="admin-provision-tabs" role="tablist" aria-label="طريقة إضافة المشرف">
      <button type="button" role="tab" aria-selected={mode === "link"} className={mode === "link" ? "selected" : ""} onClick={() => { setMode("link"); setMessage(null); }}>ربط حساب مسجل</button>
      <button type="button" role="tab" aria-selected={mode === "create"} className={mode === "create" ? "selected" : ""} onClick={() => { setMode("create"); setMessage(null); }}>إنشاء حساب جديد</button>
    </div>
    <p className="admin-provision-hint">{mode === "link"
      ? "اربط حساب لاعب مسجلاً بالفعل. نحتفظ بالبريد والاسم وكلمة المرور ونوع الحساب وحالة الإيقاف كما هي."
      : "أنشئ حساب دخول جديداً للمشرف؛ سيُستخدم البريد المدخل لتسجيل الدخول والتحقق بالبريد."}</p>
    {mode === "create" && <label>اسم المشرف الكامل<input value={name} onChange={event => setName(event.target.value)} autoComplete="name" minLength={2} maxLength={160} required /></label>}
    <label>البريد الإلكتروني للمشرف<input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" placeholder="moderator@example.com" maxLength={320} required /><small>{mode === "link" ? "استخدم البريد نفسه المسجل في الحساب القائم." : "استخدم بريد المشرف نفسه، وليس بريد المدير الذي ينشئ الحساب."}</small></label>
    {mode === "create" && <label>كلمة مرور حساب المشرف<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" minLength={8} maxLength={128} required /></label>}
    <label>الدور<select value={role} onChange={event => setRole(event.target.value as ModeratorRole)}><option value="moderator">مشرف محدد الصلاحيات</option><option value="admin">مدير إداري</option></select></label>
    <fieldset className="admin-scope-fieldset"><legend>نطاقات الوصول</legend><div className="permission-picker">{permissionOptions.map(([id, label]) => <label key={id}><input type="checkbox" checked={permissions.includes(id)} onChange={() => togglePermission(id)} />{label}</label>)}</div></fieldset>
    {message && <p className={`admin-provision-message ${message.kind}`} role={message.kind === "error" ? "alert" : "status"}>{message.text}</p>}
    <button className="gold-button" disabled={busy}>{busy ? "جارٍ الحفظ…" : mode === "link" ? "ربط الحساب ومنح الصلاحيات" : "إنشاء حساب المشرف"}</button>
  </form>;
}
