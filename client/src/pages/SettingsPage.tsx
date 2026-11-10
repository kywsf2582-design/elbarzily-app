import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Bell, Camera, LifeBuoy, LoaderCircle, Save, Settings2, ShieldOff, UserRound } from "lucide-react";
import { toast } from "sonner";
import { PageHeading } from "@/features/app/AppShell";
import { enableWebPush } from "@/features/push/PushNotifications";
import { trpc } from "@/lib/trpc";
import { mediaUrl } from "@/lib/mediaUrl";
import { useTheme } from "@/contexts/ThemeContext";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type AccountUser = { id: number; accountType?: string; name?: string | null; email?: string | null; phone?: string | null; avatarUrl?: string | null; age?: number | null; position?: string | null; skillLevel?: string | null; bio?: string | null; isDiscoverable?: boolean };
const api = trpc as any;
const themeChoices = [
  { value: "dark" as const, label: "داكن", description: "أسود صريح وكلام أبيض، والعناصر واضحة." },
  { value: "light" as const, label: "فاتح", description: "أبيض ودرجات فاتحة وسط تريح عينك." },
  { value: "olive" as const, label: "زيتوني", description: "أخضر زيتي هادي مع كتابة فاتحة." },
];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("ماقدرناش نقرا الصورة"));
    reader.readAsDataURL(file);
  });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "حصلت مشكلة مش متوقعة.";
}

export default function SettingsPage({ user }: { user: AccountUser | null }) {
  const [, setLocation] = useLocation();
  const { theme, setThemePreference } = useTheme();
  const utils = trpc.useUtils();
  const updateProfile = api.auth.updateProfile.useMutation();
  const uploadImage = api.uploads.image.useMutation();
  const blockedQuery = api.social.blocks.mine.useQuery(undefined, { enabled: Boolean(user), retry: false });
  const unblockMutation = api.social.blocks.unblock.useMutation();
  const pushPreferencesQuery = api.push.preferences.useQuery(undefined, { enabled: Boolean(user), retry: false });
  const savePushPreferences = api.push.savePreferences.useMutation();
  const testPush = api.push.test.useMutation();
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [age, setAge] = useState(user?.age ? String(user.age) : "");
  const [position, setPosition] = useState(user?.position || "");
  const [skillLevel, setSkillLevel] = useState(user?.skillLevel || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [isDiscoverable, setIsDiscoverable] = useState(Boolean(user?.isDiscoverable));
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState(user?.avatarUrl || "");
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [notificationState, setNotificationState] = useState<NotificationPermission | "unsupported">("default");
  const [deleteRequestOpen, setDeleteRequestOpen] = useState(false);
  const [pushPreferences, setPushPreferences] = useState({ chat: true, bookings: true, matches: true, social: true, calls: true, hideMessagePreview: false });
  const busy = Boolean(updateProfile.isPending || uploadImage.isPending);
  const blockedUsers = (blockedQuery.data as any)?.items || [];

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) { setNotificationState("unsupported"); return; }
    setNotificationState(Notification.permission);
  }, []);

  useEffect(() => {
    if (pushPreferencesQuery.data) setPushPreferences({
      chat: pushPreferencesQuery.data.chat,
      bookings: pushPreferencesQuery.data.bookings,
      matches: pushPreferencesQuery.data.matches,
      social: pushPreferencesQuery.data.social,
      calls: pushPreferencesQuery.data.calls,
      hideMessagePreview: pushPreferencesQuery.data.hideMessagePreview,
    });
  }, [pushPreferencesQuery.data]);

  useEffect(() => {
    setName(user?.name || "");
    setPhone(user?.phone || "");
    setAge(user?.age ? String(user.age) : "");
    setPosition(user?.position || "");
    setSkillLevel(user?.skillLevel || "");
    setBio(user?.bio || "");
    setIsDiscoverable(Boolean(user?.isDiscoverable));
    setAvatarPreview(user?.avatarUrl || "");
    setAvatarLoadFailed(false);
    setAvatarFile(null);
  }, [user?.id, user?.name, user?.phone, user?.avatarUrl, user?.age, user?.position, user?.skillLevel, user?.bio, user?.isDiscoverable]);

  useEffect(() => {
    if (!avatarPreview.startsWith("blob:")) return;
    return () => URL.revokeObjectURL(avatarPreview);
  }, [avatarPreview]);

  const choosePhoto = (file?: File) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      toast.error("اختار صورة JPG أو PNG أو WebP، حجمها مايزيدش عن 5 ميجابايت.");
      return;
    }
    setAvatarFile(file);
    setAvatarLoadFailed(false);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) {
      setLocation("/join");
      return;
    }
    if (user.accountType === "player" && isDiscoverable && (!age.trim() || !position)) {
      toast.error("كمّل عمرك ومركز لعبك قبل ما تخلّي ملفك ظاهر في دليل اللاعبين.");
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
        if (!avatarKey) throw new Error("التخزين مرجّعش عنوان الصورة.");
      }
      const savedUser = await updateProfile.mutateAsync({
        name: name.trim(),
        phone: phone.trim(),
        age: age.trim() ? Number(age) : null,
        position: position || null,
        skillLevel: skillLevel || null,
        bio: bio.trim() || null,
        isDiscoverable,
        ...(avatarKey ? { avatarKey } : {}),
      });
      const savedAvatarUrl = (savedUser as any)?.avatarUrl || (avatarKey ? `/manus-storage/${avatarKey}` : undefined);
      if (savedAvatarUrl) setAvatarPreview(savedAvatarUrl);
      setAvatarLoadFailed(false);
      utils.auth.me.setData(undefined, savedUser as any);
      await utils.auth.me.invalidate();
      setAvatarFile(null);
      toast.success("حدّثنا بيانات حسابك.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const unblockUser = async (userId: number) => {
    try {
      await unblockMutation.mutateAsync({ userId });
      await blockedQuery.refetch();
      toast.success("شيلنا الحظر.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const enableNotifications = async () => {
    try {
      await enableWebPush();
      setNotificationState("granted");
      toast.success("فعّلنا إشعارات البرازيلي على الجهاز ده.");
    } catch (error) { toast.error(errorMessage(error)); }
  };

  const updatePushPreference = async (key: keyof typeof pushPreferences, value: boolean) => {
    const next = { ...pushPreferences, [key]: value };
    setPushPreferences(next);
    try { await savePushPreferences.mutateAsync({ [key]: value }); }
    catch (error) { setPushPreferences(pushPreferences); toast.error(errorMessage(error)); }
  };

  return <div className="settings-screen">
    <button type="button" className="settings-back-button" onClick={() => setLocation("/profile")}><ArrowLeft size={17} /> ارجع لحسابي</button>
    <PageHeading eyebrow="حسابك زي ما تحب" title="إعداداتك" description="ظبّط بياناتك وتفضيلاتك من مكان واحد." action={<button className="button-outline compact-button" onClick={() => setLocation("/suggest-pitch")}>اقترح ملعب <ArrowLeft size={15} /></button>} />
    <div className="settings-layout account-settings-layout">
      <section className="settings-category" aria-labelledby="settings-account-heading">
        <div className="settings-category-heading"><UserRound size={19} /><div><span className="eyebrow">القسم الأول</span><h2 id="settings-account-heading">حسابك</h2></div></div>
        <section className="panel-card">
          <div className="panel-title"><div><span className="eyebrow">بيانات حسابك</span><h2>ملفي الشخصي</h2></div><UserRound size={19} /></div>
          {user ? <form className="owner-form profile-edit-form" onSubmit={saveProfile}>
            <div className="profile-edit-layout">
              <div className="profile-edit-avatar-column">
                <div className="profile-edit-avatar">{avatarPreview && !avatarLoadFailed ? <img key={avatarPreview} src={mediaUrl(avatarPreview)} alt="معاينة صورتك الشخصية" onError={() => setAvatarLoadFailed(true)} /> : (name || "ب").charAt(0)}</div>
                <label className="button-outline compact-button profile-photo-picker" htmlFor="profile-avatar-upload"><Camera size={15} /> غيّر الصورة</label>
                <input id="profile-avatar-upload" className="profile-photo-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { choosePhoto(event.target.files?.[0]); event.currentTarget.value = ""; }} />
                {avatarLoadFailed && <small className="profile-photo-error">الصورة مش راضية تفتح دلوقتي. جرّب تختارها تاني بعد ما تتأكد إن النت شغال.</small>}
                <small>JPG أو PNG أو WebP، وحجم الصورة مايزيدش عن 5 ميجابايت.</small>
              </div>
              <div className="profile-edit-fields">
                <label className="form-field"><span>اسمك</span><input value={name} onChange={event => setName(event.target.value)} maxLength={160} required /></label>
                <div className="two-fields">
                  <label className="form-field"><span>العمر</span><input type="number" inputMode="numeric" min="13" max="90" value={age} onChange={event => setAge(event.target.value)} placeholder="مثال: 24 سنة" required={user.accountType === "player" && isDiscoverable} /></label>
                  <label className="form-field"><span>مركز لعبك</span><select value={position} onChange={event => setPosition(event.target.value)} required={user.accountType === "player" && isDiscoverable}><option value="">اختار مركزك</option><option value="goalkeeper">حارس مرمى</option><option value="defender">مدافع</option><option value="midfielder">لاعب وسط</option><option value="forward">مهاجم</option></select></label>
                </div>
                {user.accountType === "player" && <label className="form-field"><span>مستوى لعبك</span><select value={skillLevel} onChange={event => setSkillLevel(event.target.value)}><option value="">اختار مستواك</option><option value="مبتدئ">مبتدئ</option><option value="متوسط">متوسط</option><option value="متقدم">متقدم</option><option value="محترف">محترف</option></select></label>}
                <label className="form-field"><span>احكي لنا عنك (اختياري)</span><textarea value={bio} onChange={event => setBio(event.target.value)} maxLength={500} rows={3} placeholder="احكي لنا عن نفسك وطريقة لعبك" /></label>
                {user.accountType === "player" && <label className="theme-switch-row"><input type="checkbox" checked={isDiscoverable} onChange={event => setIsDiscoverable(event.target.checked)} /><span><b>خلّي ملفك ظاهر في دليل اللاعبين</b><small>اللاعبين المسجلين يقدروا يلاقوك باسمك ومركز لعبك.</small></span></label>}
                <label className="form-field"><span>رقم موبايلك</span><input type="tel" inputMode="tel" value={phone} onChange={event => setPhone(event.target.value)} maxLength={32} placeholder="01X XXXX XXXX" required /></label>
                <label className="form-field"><span>الإيميل (للقراية بس)</span><input type="email" value={user.email || ""} disabled /></label>
                <button className="button-primary" type="submit" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />} احفظ بيانات حسابك</button>
              </div>
            </div>
          </form> : <div className="profile-signin-note"><p>سجّل دخولك عشان تغيّر اسمك ورقم موبايلك وصورتك.</p><button className="button-primary" onClick={() => setLocation("/join")}>سجّل دخولك / اعمل حساب <ArrowLeft size={15} /></button></div>}
        </section>
      </section>

      <section className="settings-category" aria-labelledby="settings-preferences-heading">
        <div className="settings-category-heading"><Settings2 size={19} /><div><span className="eyebrow">القسم التاني</span><h2 id="settings-preferences-heading">تفضيلاتك</h2></div></div>
        <section className="panel-card">
          <div className="panel-title"><div><span className="eyebrow">شكل التطبيق ولغته</span><h2>على مزاجك</h2></div><Settings2 size={19} /></div>
          <div className="settings-language-row"><span><b>لغة التطبيق</b><small>العربي دلوقتي</small></span></div>
          <div className="theme-choice-grid" role="group" aria-label="اختار ألوان التطبيق">
            {themeChoices.map(choice => <button key={choice.value} type="button" className={`theme-choice ${theme === choice.value ? "selected" : ""}`} aria-pressed={theme === choice.value} onClick={() => setThemePreference(choice.value)}>
              <span className={`theme-preview theme-preview-${choice.value}`} aria-hidden="true"><i /><i /></span>
              <span className="theme-choice-copy"><b>{choice.label}</b><small>{choice.description}</small></span>
              <span className="theme-choice-check">{theme === choice.value ? "شغال دلوقتي" : "اختار"}</span>
            </button>)}
          </div>
          <p className="settings-preference-note">اختار الشكل اللي يريح عينك. هنفتكر اختيارك ونرجعله لما تفتح التطبيق تاني.</p>
          <button type="button" className="button-outline compact-button" onClick={() => setLocation("/support")}><LifeBuoy size={15} /> محتاج مساعدة؟ كلم الدعم <ArrowLeft size={15} /></button>
        </section>
        <section className="panel-card notification-settings-card">
          <div className="panel-title"><div><span className="eyebrow">إعدادات التنبيهات</span><h2>خليك متابع الماتش</h2></div><Bell size={19} /></div>
          <p className="muted">فعّل التنبيهات عشان يوصلك كل جديد عن الحجوزات والماتشات ورسايل الدعم، حتى لو التطبيق مقفول.</p>
          <div className="notification-permission-row"><span className={`notification-dot ${notificationState === "granted" ? "on" : ""}`} /><div><b>{notificationState === "granted" ? "تنبيهات جهازك شغالة" : notificationState === "denied" ? "المتصفح مانع التنبيهات" : notificationState === "unsupported" ? "المتصفح ده مش بيدعم التنبيهات" : "تنبيهات الجهاز مش شغالة"}</b><small>تقدر تغيّر الإعداد ده من هنا في أي وقت.</small></div><button className="button-primary compact-button" type="button" onClick={() => void enableNotifications()} disabled={notificationState === "granted" || notificationState === "unsupported"}>{notificationState === "denied" ? "فعّلها من إعدادات الجهاز" : notificationState === "granted" ? "شغالة" : "فعّل التنبيهات"}</button></div>
          {user && <div className="push-preferences-grid">
            {([['chat', 'رسائل الدعم'], ['bookings', 'الحجوزات'], ['matches', 'المباريات'], ['social', 'طلبات الصداقة والمكافآت']] as const).map(([key, label]) => <label className="theme-switch-row" key={key}><input type="checkbox" checked={pushPreferences[key]} onChange={event => void updatePushPreference(key, event.target.checked)} /><span><b>{label}</b><small>اختار لو تحب يوصلك تنبيه بالنوع ده.</small></span></label>)}
            <label className="theme-switch-row"><input type="checkbox" checked={pushPreferences.hideMessagePreview} onChange={event => void updatePushPreference("hideMessagePreview", event.target.checked)} /><span><b>خبّي معاينة الرسالة</b><small>هيظهر «عندك رسالة جديدة» بدل محتوى الرسالة على شاشة القفل.</small></span></label>
            <button className="button-outline compact-button" type="button" onClick={() => void testPush.mutateAsync().then((result: { sent: number }) => toast.success(result.sent ? "بعتنالك إشعار تجريبي." : "اتأكد إنك سامح بالتنبيهات وإن التطبيق متثبت."), (error: unknown) => toast.error(errorMessage(error)))} disabled={testPush.isPending || notificationState !== "granted"}>{testPush.isPending ? "بيبعت…" : "جرّب إشعار"}</button>
          </div>}
        </section>
      </section>

      <section className="settings-category" aria-labelledby="settings-security-heading">
        <div className="settings-category-heading"><ShieldOff size={19} /><div><span className="eyebrow">القسم التالت</span><h2 id="settings-security-heading">الأمان والخصوصية</h2></div></div>
        {user ? <section className="panel-card blocked-users-panel">
          <div className="panel-title"><div><span className="eyebrow">إدارة الحظر</span><h2>اللاعبين اللي حظرتهم</h2></div><ShieldOff size={19} /></div>
          <p className="muted">راجع قائمة الحظر وشيل منها أي لاعب وقت ما تحب.</p>
          {blockedQuery.isLoading ? <div className="settings-hint"><LoaderCircle size={15} className="spin" /><span>بنحمّل قائمة الحظر…</span></div> : blockedUsers.length ? <div className="blocked-users-list">{blockedUsers.map((blocked: any) => <div className="blocked-user-row" key={blocked.id}><span className="blocked-user-avatar">{blocked.avatarUrl ? <img src={blocked.avatarUrl} alt="" onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = "/brzly-logo.svg"; }} /> : (blocked.name || "ل").charAt(0)}</span><div><b>{blocked.name || "لاعب"}</b><small>محظور عندك</small></div><button className="button-outline compact-button" type="button" onClick={() => void unblockUser(Number(blocked.id))} disabled={unblockMutation.isPending}><ShieldOff size={14} /> إلغاء الحظر</button></div>)}</div> : <div className="settings-hint"><span>مفيش لاعبين في قائمة الحظر دلوقتي.</span></div>}
        </section> : <section className="panel-card"><p className="muted">سجّل دخولك عشان تراجع إعدادات الأمان والخصوصية.</p><button className="button-primary" onClick={() => setLocation("/join")}>سجّل دخولك / اعمل حساب <ArrowLeft size={15} /></button></section>}
      </section>

      {user && <section className="account-delete-zone" aria-labelledby="account-delete-title">
        <div><span className="eyebrow">إجراء منفصل</span><h2 id="account-delete-title">عايز تسيب الملعب؟</h2><p>فريق الدعم هيراجع طلب حذف حسابك عشان يتأكد إن مفيش حجوزات أو طلبات لسه مفتوحة.</p></div>
        <button type="button" className="account-delete-button" onClick={() => setDeleteRequestOpen(true)}><ShieldOff size={16} /> حذف الحساب</button>
      </section>}
    </div>
    <AlertDialog open={deleteRequestOpen} onOpenChange={setDeleteRequestOpen}>
      <AlertDialogContent dir="rtl" className="account-delete-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>عايز تطلب حذف حسابك؟</AlertDialogTitle>
          <AlertDialogDescription>مش هيتحذف حسابك تلقائي من الشاشة دي. لو كملت، هنفتحلك الدعم عشان تبعت طلبك ويتراجع بأمان. حسابك وبياناتك مش هيتحذفوا بمجرد ما تدوس هنا.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>رجوع</AlertDialogCancel>
          <AlertDialogAction className="account-delete-confirm" onClick={() => setLocation("/support")}>كلم الدعم</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
