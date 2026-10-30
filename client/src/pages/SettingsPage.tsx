import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Bell, Camera, LoaderCircle, Moon, Save, Settings2, ShieldOff, Sun, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "@/contexts/ThemeContext";
import { PageHeading } from "@/features/app/AppShell";
import { trpc } from "@/lib/trpc";

type AccountUser = { id: number; accountType?: string; name?: string | null; email?: string | null; phone?: string | null; avatarUrl?: string | null; age?: number | null; position?: string | null; skillLevel?: string | null; bio?: string | null; isDiscoverable?: boolean };
const api = trpc as any;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("تعذر قراءة الصورة"));
    reader.readAsDataURL(file);
  });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "حدث خطأ غير متوقع.";
}

export default function SettingsPage({ user }: { user: AccountUser | null }) {
  const [, setLocation] = useLocation();
  const { theme, preference, setThemePreference } = useTheme();
  const utils = trpc.useUtils();
  const updateProfile = api.auth.updateProfile.useMutation();
  const uploadImage = api.uploads.image.useMutation();
  const blockedQuery = api.social.blocks.mine.useQuery(undefined, { enabled: Boolean(user), retry: false });
  const unblockMutation = api.social.blocks.unblock.useMutation();
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [age, setAge] = useState(user?.age ? String(user.age) : "");
  const [position, setPosition] = useState(user?.position || "");
  const [skillLevel, setSkillLevel] = useState(user?.skillLevel || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [isDiscoverable, setIsDiscoverable] = useState(Boolean(user?.isDiscoverable));
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState(user?.avatarUrl || "");
  const [notificationState, setNotificationState] = useState<NotificationPermission | "unsupported">("default");
  const busy = Boolean(updateProfile.isPending || uploadImage.isPending);
  const blockedUsers = (blockedQuery.data as any)?.items || [];

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) { setNotificationState("unsupported"); return; }
    setNotificationState(Notification.permission);
  }, []);

  useEffect(() => {
    setName(user?.name || "");
    setPhone(user?.phone || "");
    setAge(user?.age ? String(user.age) : "");
    setPosition(user?.position || "");
    setSkillLevel(user?.skillLevel || "");
    setBio(user?.bio || "");
    setIsDiscoverable(Boolean(user?.isDiscoverable));
    setAvatarPreview(user?.avatarUrl || "");
    setAvatarFile(null);
  }, [user?.id, user?.name, user?.phone, user?.avatarUrl, user?.age, user?.position, user?.skillLevel, user?.bio, user?.isDiscoverable]);

  useEffect(() => {
    if (!avatarPreview.startsWith("blob:")) return;
    return () => URL.revokeObjectURL(avatarPreview);
  }, [avatarPreview]);

  const choosePhoto = (file?: File) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      toast.error("اختر صورة JPG أو PNG أو WebP لا تتجاوز 5 ميغابايت.");
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) {
      setLocation("/join");
      return;
    }
    if (user.accountType === "player" && isDiscoverable && (!age.trim() || !position)) {
      toast.error("أكمل العمر ومركز اللعب قبل إظهار ملفك في دليل اللاعبين.");
      return;
    }
    try {
      let avatarKey: string | undefined;
      if (avatarFile) {
        const dataUrl = await fileToDataUrl(avatarFile);
        const dataBase64 = dataUrl.split(",", 2)[1] || "";
        const uploaded = await uploadImage.mutateAsync({
          fileName: avatarFile.name,
          mimeType: avatarFile.type,
          dataBase64,
        });
        avatarKey = (uploaded as any)?.key;
        if (!avatarKey) throw new Error("لم يُرجع التخزين عنوان الصورة.");
      }
      await updateProfile.mutateAsync({
        name: name.trim(),
        phone: phone.trim(),
        age: age.trim() ? Number(age) : null,
        position: position || null,
        skillLevel: skillLevel || null,
        bio: bio.trim() || null,
        isDiscoverable,
        ...(avatarKey ? { avatarKey } : {}),
      });
      await utils.auth.me.invalidate();
      setAvatarFile(null);
      toast.success("تم تحديث بيانات حسابك.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const unblockUser = async (userId: number) => {
    try {
      await unblockMutation.mutateAsync({ userId });
      await blockedQuery.refetch();
      toast.success("تم إلغاء الحظر ويمكنك التواصل مع اللاعب الآن.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const enableNotifications = async () => {
    if (!("Notification" in window)) { toast.error("هذا المتصفح لا يدعم إشعارات التطبيق."); return; }
    try {
      const permission = await Notification.requestPermission();
      setNotificationState(permission);
      if (permission === "granted") toast.success("تم تفعيل إشعارات البرازيلي على هذا الجهاز.");
      else if (permission === "denied") toast.error("تم رفض الإشعارات. يمكنك تفعيلها من إعدادات المتصفح.");
    } catch { toast.error("تعذر طلب إذن الإشعارات الآن."); }
  };

  return <>
    <PageHeading
      eyebrow="تفضيلاتك وحسابك"
      title="إعدادات التطبيق"
      description="عدّل مظهر التطبيق وبيانات ملفك الشخصي."
      action={<button className="button-outline compact-button" onClick={() => setLocation("/suggest-pitch")}>اقتراح ملعب <ArrowLeft size={15} /></button>}
    />
    <div className="settings-layout account-settings-layout">
      <section className="panel-card">
        <div className="panel-title"><div><span className="eyebrow">بيانات الحساب</span><h2>ملفي الشخصي</h2></div><UserRound size={19} /></div>
        {user ? <form className="owner-form profile-edit-form" onSubmit={saveProfile}>
          <div className="profile-edit-layout">
            <div className="profile-edit-avatar-column">
              <div className="profile-edit-avatar">{avatarPreview ? <img src={avatarPreview} alt="معاينة الصورة الشخصية" /> : (name || "ب").charAt(0)}</div>
              <label className="button-outline compact-button profile-photo-picker" htmlFor="profile-avatar-upload"><Camera size={15} /> تغيير الصورة</label>
              <input id="profile-avatar-upload" className="profile-photo-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={event => choosePhoto(event.target.files?.[0])} />
              <small>JPG أو PNG أو WebP، بحد أقصى 5 ميغابايت.</small>
            </div>
            <div className="profile-edit-fields">
              <label className="form-field"><span>الاسم</span><input value={name} onChange={event => setName(event.target.value)} maxLength={160} required /></label>
              <div className="two-fields">
                <label className="form-field"><span>العمر</span><input type="number" inputMode="numeric" min="13" max="90" value={age} onChange={event => setAge(event.target.value)} placeholder="مثال: 24" required={user.accountType === "player" && isDiscoverable} /></label>
                <label className="form-field"><span>مركز اللعب</span><select value={position} onChange={event => setPosition(event.target.value)} required={user.accountType === "player" && isDiscoverable}><option value="">اختر مركزك</option><option value="goalkeeper">حارس مرمى</option><option value="defender">مدافع</option><option value="midfielder">لاعب وسط</option><option value="forward">مهاجم</option></select></label>
              </div>
              {user.accountType === "player" && <label className="form-field"><span>مستوى اللعب</span><select value={skillLevel} onChange={event => setSkillLevel(event.target.value)}><option value="">اختر مستواك</option><option value="مبتدئ">مبتدئ</option><option value="متوسط">متوسط</option><option value="متقدم">متقدم</option><option value="محترف">محترف</option></select></label>}
              <label className="form-field"><span>السيرة الذاتية (اختياري)</span><textarea value={bio} onChange={event => setBio(event.target.value)} maxLength={500} rows={3} placeholder="عرّف عن نفسك وعن أسلوب لعبك" /></label>
              {user.accountType === "player" && <label className="theme-switch-row"><input type="checkbox" checked={isDiscoverable} onChange={event => setIsDiscoverable(event.target.checked)} /><span><b>إظهار ملفي في دليل اللاعبين</b><small>يمكن للاعبين المسجلين العثور عليك بالاسم ومركز اللعب.</small></span></label>}
              <label className="form-field"><span>رقم الهاتف</span><input type="tel" inputMode="tel" value={phone} onChange={event => setPhone(event.target.value)} maxLength={32} placeholder="01X XXXX XXXX" required /></label>
              <label className="form-field"><span>البريد الإلكتروني (للقراءة فقط)</span><input type="email" value={user.email || ""} disabled /></label>
              <button className="button-primary" type="submit" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />} حفظ بيانات الحساب</button>
            </div>
          </div>
        </form> : <div className="profile-signin-note"><p>سجّل الدخول لتعديل الاسم ورقم الهاتف والصورة الشخصية.</p><button className="button-primary" onClick={() => setLocation("/join")}>تسجيل الدخول <ArrowLeft size={15} /></button></div>}
      </section>
      <section className="panel-card">
        <div className="panel-title"><div><span className="eyebrow">مظهر التطبيق</span><h2>الراحة على طريقتك</h2></div>{theme === "dark" ? <Moon size={19} /> : <Sun size={19} />}</div>
        <div className="theme-choice-row"><div><b>{preference === "system" ? "حسب إعداد الجهاز" : theme === "dark" ? "الوضع الداكن" : "الوضع الفاتح"}</b><small>اختر المظهر الذي يريحك وسيُحفظ على هذا الجهاز.</small></div><select className="theme-preference-select" value={preference} onChange={event => setThemePreference(event.target.value as "light" | "dark" | "system")} aria-label="اختيار مظهر التطبيق"><option value="system">حسب الجهاز</option><option value="light">فاتح</option><option value="dark">داكن</option></select></div>
        <div className="settings-hint"><Settings2 size={15} /><span>الوضع الحالي: {theme === "dark" ? "داكن" : "فاتح"}. يتغير تلقائياً عند اختيار «حسب الجهاز».</span></div>
      </section>
      <section className="panel-card notification-settings-card">
        <div className="panel-title"><div><span className="eyebrow">تنبيهات الملعب</span><h2>خليك قريب من المباراة</h2></div><Bell size={19} /></div>
        <p className="muted">استقبل تنبيهات الطلبات والرسائل وتحديثات المباريات من المتصفح حتى عندما يكون التطبيق مثبتاً على جهازك.</p>
        <div className="notification-permission-row"><span className={`notification-dot ${notificationState === "granted" ? "on" : ""}`} /><div><b>{notificationState === "granted" ? "الإشعارات مفعّلة" : notificationState === "denied" ? "الإشعارات مرفوضة من المتصفح" : notificationState === "unsupported" ? "المتصفح لا يدعم الإشعارات" : "الإشعارات غير مفعّلة"}</b><small>يمكنك تغيير الإذن لاحقاً من إعدادات المتصفح.</small></div><button className="button-primary compact-button" type="button" onClick={() => void enableNotifications()} disabled={notificationState === "granted" || notificationState === "unsupported"}>{notificationState === "denied" ? "فتح إعدادات المتصفح" : notificationState === "granted" ? "مفعّلة" : "تفعيل الإشعارات"}</button></div>
      </section>
      {user && <section className="panel-card blocked-users-panel">
        <div className="panel-title"><div><span className="eyebrow">الخصوصية والتحكم</span><h2>المستخدمون المحظورون</h2></div><ShieldOff size={19} /></div>
        <p className="muted">راجع قائمة الحظر وأعد التواصل مع أي لاعب في أي وقت.</p>
        {blockedQuery.isLoading ? <div className="settings-hint"><LoaderCircle size={15} className="spin" /><span>جارٍ تحميل قائمة الحظر…</span></div> : blockedUsers.length ? <div className="blocked-users-list">{blockedUsers.map((blocked: any) => <div className="blocked-user-row" key={blocked.id}><span className="blocked-user-avatar">{blocked.avatarUrl ? <img src={blocked.avatarUrl} alt="" /> : (blocked.name || "ل").charAt(0)}</span><div><b>{blocked.name || "لاعب"}</b><small>محظور من حسابك</small></div><button className="button-outline compact-button" type="button" onClick={() => void unblockUser(Number(blocked.id))} disabled={unblockMutation.isPending}><ShieldOff size={14} /> إلغاء الحظر</button></div>)}</div> : <div className="settings-hint"><span>لا يوجد أي مستخدم محظور حالياً.</span></div>}
      </section>}
    </div>
  </>;
}
