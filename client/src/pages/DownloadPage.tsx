import { useEffect, useRef, useState } from "react";
import "./download.css";
import {
  ArrowDownToLine,
  ArrowLeft,
  Check,
  CircleHelp,
  Download,
  Headphones,
  LoaderCircle,
  MessageCircle,
  ShieldCheck,
  Smartphone,
  Trophy,
  UsersRound,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

const api = trpc as any;
const BUNDLED_APK_URL = "/downloads/ElBarzily-Android-2.0.4.apk";
const API_BASE_URL = import.meta.env.PROD ? "" : (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
type DeviceKind = "android" | "ios" | "windows" | "desktop";
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

function detectDevice(): DeviceKind {
  const agent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/android/i.test(agent)) return "android";
  const ipadOS = typeof navigator !== "undefined" && navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  if (/iphone|ipad|ipod/i.test(agent) || ipadOS) return "ios";
  if (/windows/i.test(agent)) return "windows";
  return "desktop";
}

function supportIsExternal(link: string): boolean {
  return /^(https:|mailto:|tel:)/i.test(link);
}

function compareVersions(latest: string, previous: string): number {
  if (latest === previous) return 0;
  const parse = (value: string) => value.replace(/^v/i, "").split(/[.+-]/).slice(0, 3).map(part => Number.parseInt(part, 10));
  const a = parse(latest);
  const b = parse(previous);
  for (let index = 0; index < 3; index += 1) {
    const left = Number.isFinite(a[index]) ? a[index] : 0;
    const right = Number.isFinite(b[index]) ? b[index] : 0;
    if (left !== right) return left > right ? 1 : -1;
  }
  return 1;
}

export default function DownloadPage() {
  const query = api.downloadSettings.public.useQuery(undefined, { retry: false, staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: true });
  const requestDownload = api.downloadSettings.request.useMutation();
  const settings = query.data as {
    available?: boolean;
    fileName?: string | null;
    appName?: string | null;
    version?: string | null;
    windowsAvailable?: boolean;
    windowsFileName?: string | null;
    supportLink?: string | null;
    supportNumbers?: { number: string; url: string }[];
  } | undefined;
  const [device, setDevice] = useState<DeviceKind>("desktop");
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [installMessage, setInstallMessage] = useState("");
  const [lastRequestedVersion, setLastRequestedVersion] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const downloadStarted = useRef(false);

  useEffect(() => setDevice(detectDevice()), []);
  useEffect(() => { try { setLastRequestedVersion(window.localStorage.getItem("brzly-last-apk-download") || ""); } catch { setLastRequestedVersion(""); } }, []);
  useEffect(() => {
    const onBeforeInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPrompt); };
    const onInstalled = () => { setInstallPrompt(null); setInstallMessage("تم تثبيت البرازيلي كتطبيق على هذا الجهاز."); };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onBeforeInstall); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  // The APK is also bundled in Pages so it remains downloadable if Neon settings or the API are unavailable.
  const downloadAvailable = true;
  const windowsAvailable = Boolean(settings?.windowsAvailable);
  const hasNewerApk = Boolean(downloadAvailable && settings?.version && (!lastRequestedVersion || compareVersions(settings.version, lastRequestedVersion) > 0));
  const supportLink = settings?.supportLink || "/support";
  const isExternalSupport = supportIsExternal(supportLink);
  const supportNumbers = settings?.supportNumbers ?? [];
  const isDesktopDevice = device === "windows" || device === "desktop";
  const ctaLabel = device === "android" ? "ثبّت التطبيق الآن" : "تنزيل تطبيق Android (APK)";
  const beginDownload = async (platform: "android" | "windows") => {
    if (downloadStarted.current) return;
    downloadStarted.current = true;
    setDownloadError("");
    if (platform === "android") {
      if (settings?.available) {
        try { await requestDownload.mutateAsync({ platform }); }
        catch { /* the bundled APK remains available without API/DB */ }
      }
      try {
        const version = settings?.version || "2.0.4";
        window.localStorage.setItem("brzly-last-apk-download", version);
        setLastRequestedVersion(version);
      } catch { /* storage may be disabled */ }
      window.location.assign(BUNDLED_APK_URL);
      return;
    }
    try {
      const result = await requestDownload.mutateAsync({ platform }) as { url?: string };
      if (!result?.url) throw new Error("No download URL returned");
      window.location.assign(new URL(result.url, API_BASE_URL || window.location.origin).toString());
    } catch {
      downloadStarted.current = false;
      setDownloadError("تعذر بدء التنزيل الآن. أعد المحاولة بعد لحظات؛ لم يتم تسجيل عملية التنزيل.");
    }
  };
  const deviceMessage = device === "android"
    ? "التنزيل جاهز لهاتفك. افتح الملف واتبع خطوات التثبيت التي يعرضها Android."
    : device === "ios"
      ? "هذا الإصدار ملف Android APK ولا يمكن تثبيته على iPhone أو iPad."
      : device === "windows"
        ? windowsAvailable ? "نسخة Windows Desktop جاهزة؛ يتطلب تشغيلها اتصالاً بالإنترنت." : "يمكن تثبيت البرازيلي كتطبيق Desktop من Edge أو Chrome."
        : windowsAvailable ? "يمكن تنزيل APK لهاتف Android أو ملف Windows Desktop (.exe) لهذا الكمبيوتر." : "يمكن تنزيل ملف APK على الكمبيوتر؛ تثبيته يحتاج إلى هاتف أو جهاز Android.";
  const installDesktop = async () => {
    if (!installPrompt) {
      setInstallMessage("من قائمة Edge أو Chrome اختر Apps ثم Install this site as an app.");
      return;
    }
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallMessage(choice.outcome === "accepted" ? "جاري تثبيت تطبيق البرازيلي على Windows." : "يمكنك تثبيته لاحقاً من قائمة المتصفح.");
      setInstallPrompt(null);
    } catch { setInstallMessage("افتح قائمة Edge أو Chrome واختر تثبيت هذا الموقع كتطبيق."); }
  };

  return (
    <main className="download-page" dir="rtl">
      <div className="download-page-glow download-page-glow-one" aria-hidden="true" />
      <div className="download-page-glow download-page-glow-two" aria-hidden="true" />
      <header className="download-topbar">
        <a className="download-brand" href="/" aria-label="البرازيلي — الرئيسية">
          <img src="/brzly-logo.svg" alt="" />
          <span><b>البرازيلي</b><small>كورة أقرب. ملعبك جاهز.</small></span>
        </a>
        <a className="download-header-link" href="/">العودة للموقع <ArrowLeft size={15} /></a>
      </header>

      <section className="download-hero">
        <div className="download-hero-copy">
          <span className="download-kicker"><span /> {settings?.appName || "تطبيق البرازيلي الرسمي"}</span>
          <h1>اللعب يبدأ<br /><em>من هنا.</em></h1>
          <p className="download-lede">ملاعبك، مواعيدك، وفريقك المفضل — كلها في تطبيق واحد مصمم لعشاق كرة القدم.</p>
          <span className="download-version">الإصدار {settings?.version || "2.0.4"}</span>
          {downloadAvailable ? (
            <button className="download-main-cta" type="button" disabled={requestDownload.isPending} onClick={() => void beginDownload("android")}>
              <span className="download-cta-icon">{requestDownload.isPending ? <LoaderCircle className="spin" size={23} /> : <Download size={23} />}</span>
              <span><b>{ctaLabel}</b><small>ملف التطبيق الرسمي · {settings?.fileName || "ElBarzily-Android-2.0.4.apk"}</small></span>
              <ArrowLeft className="download-cta-arrow" size={19} />
            </button>
          ) : (
            <button className="download-main-cta is-disabled" type="button" disabled>
              <span className="download-cta-icon"><Download size={23} /></span>
              <span><b>{query.isLoading ? "جارٍ تجهيز رابط التحميل" : "التطبيق غير متاح للتنزيل حالياً"}</b><small>يرجى المحاولة لاحقاً أو التواصل مع الدعم</small></span>
            </button>
          )}
          {device === "android" && downloadAvailable && (hasNewerApk ? <button className="download-update-cta" type="button" disabled={requestDownload.isPending} onClick={() => void beginDownload("android")}>
            <span>{requestDownload.isPending ? <LoaderCircle className="spin" size={17} /> : <Download size={17} />}<b>تنزيل التحديثات تلقائياً</b></span><small>{lastRequestedVersion ? `وجدت نسخة أحدث: ${settings?.version}.` : `أحدث APK متاح هو ${settings?.version}.`} يبدأ التنزيل مباشرة؛ يلزم تأكيد Android قبل التثبيت.</small>
          </button> : <p className="download-windows-pending">آخر إصدار طُلب تنزيله من هذا الجهاز هو {lastRequestedVersion || settings?.version}. إذا لم يكتمل التنزيل أو التثبيت، يمكنك إعادة تنزيل النسخة الحالية من الزر أعلاه.</p>)}
          {(windowsAvailable || isDesktopDevice) && <div className="download-windows-options">
            {windowsAvailable ? <button className="download-windows-cta" type="button" disabled={requestDownload.isPending} onClick={() => void beginDownload("windows")}><span>{requestDownload.isPending ? <LoaderCircle className="spin" size={18} /> : <Download size={18} />} تنزيل Windows Desktop (.exe)</span><small>{settings?.windowsFileName || "El-Barzily-Setup.exe"} · x64 · يتطلب اتصالاً بالإنترنت</small></button> : <p className="download-windows-pending">لم يُرفع ملف EXE بعد؛ يمكنك تثبيت نسخة Desktop الآن كتطبيق ويب من المتصفح.</p>}
            {isDesktopDevice && <button className="download-update-cta" type="button" onClick={installDesktop}><span><Smartphone size={17} /><b>{installPrompt ? "تثبيت تطبيق البرازيلي على Windows" : "تثبيت كتطبيق Desktop"}</b></span><small>إضافة آمنة من المتصفح؛ لا تحتاج ملف تثبيت مستقل.</small></button>}
            {installMessage && <p className="download-device-note">{installMessage}</p>}
          </div>}
          {downloadError && <p className="download-error" role="alert">{downloadError}</p>}
          <p className="download-device-note"><Smartphone size={15} />{deviceMessage}</p>
          {query.isError && <p className="download-device-note">تعذر تحميل إعدادات التنزيل؛ يمكنك تنزيل ملف APK المضمن أعلاه، وقد تتأخر إحصاءات التنزيل حتى عودة الاتصال.</p>}
          <div className="download-trust-row"><span><ShieldCheck size={15} /> رابط رسمي</span><span><Check size={15} /> تحميل مباشر</span></div>
        </div>

        <div className="download-hero-art" aria-label="تطبيق البرازيلي لكرة القدم">
          <div className="download-art-orbit orbit-one" />
          <div className="download-art-orbit orbit-two" />
          <div className="download-art-ball"><Trophy size={45} strokeWidth={1.35} /></div>
          <div className="download-art-card download-art-card-top"><span className="art-card-icon"><Smartphone size={16} /></span><span><b>كل ملعب في جيبك</b><small>اختر، احجز، والعب</small></span><span className="art-live-dot" /></div>
          <div className="download-art-card download-art-card-bottom"><span className="art-card-icon"><UsersRound size={16} /></span><span><b>فريقك بانتظارك</b><small>مباريات قريبة منك</small></span><ArrowLeft size={15} /></div>
          <span className="download-art-caption">EL BARZILY <i>·</i> PLAY TOGETHER</span>
        </div>
      </section>

      <section className="download-benefits" aria-label="مميزات التطبيق">
        <article><span><Smartphone size={18} /></span><div><b>من موبايلك</b><small>كل التفاصيل في مكان واحد</small></div></article>
        <article><span><Trophy size={18} /></span><div><b>ماتشات أقوى</b><small>كوّن فريقك والعب</small></div></article>
        <article><span><UsersRound size={18} /></span><div><b>ملاعب موثوقة</b><small>احجز وقتك بسهولة</small></div></article>
      </section>

      <section className="download-lower-section" id="install">
        <div className="download-section-heading"><span className="download-kicker"><span /> تثبيت آمن وسهل</span><h2>خلال دقيقة،<br /><em>تكون جاهز.</em></h2><p>اتبع الخطوات على Android. قد تختلف أسماء القوائم قليلاً حسب نوع جهازك.</p></div>
        <div className="download-steps">
          <article><span className="step-number">01</span><span className="step-icon"><ArrowDownToLine size={20} /></span><div><h3>نزّل التطبيق</h3><p>اضغط «ثبّت التطبيق الآن» وانتظر اكتمال تنزيل ملف APK على هاتفك.</p></div></article>
          <article><span className="step-number">02</span><span className="step-icon"><CircleHelp size={20} /></span><div><h3>اسمح بالتثبيت</h3><p>إذا ظهرت رسالة حماية، اختر «الإعدادات» ثم فعّل «السماح من هذا المصدر» للمتصفح الذي نزّلت منه الملف.</p></div></article>
          <article><span className="step-number">03</span><span className="step-icon"><Smartphone size={20} /></span><div><h3>ثبّت وافتح</h3><p>ارجع إلى ملف APK واضغط «تثبيت». بعد اكتمال التثبيت، افتح التطبيق وسجّل دخولك.</p></div></article>
          <article><span className="step-number">04</span><span className="step-icon"><ShieldCheck size={20} /></span><div><h3>أوقف السماح بعد ذلك</h3><p>لأمان جهازك، يمكنك إلغاء «السماح من هذا المصدر» بعد التثبيت من إعدادات المتصفح نفسها.</p></div></article>
        </div>
      </section>

      <section className="download-rules-section">
        <div className="download-section-heading"><span className="download-kicker"><span /> نلعب باحترام</span><h2>روح الملعب<br /><em>مسؤولية الكل.</em></h2><p>التزامك يحافظ على تجربة عادلة وآمنة لكل اللاعبين وأصحاب الملاعب.</p></div>
        <div className="download-rules-grid">
          <article><span className="rule-index">01</span><ShieldCheck size={21} /><h3>إيصالات حقيقية فقط</h3><p>لا ترفق إيصال تحويل مزيفاً أو معدّلاً. التلاعب بوسائل الدفع قد يؤدي إلى إيقاف الحساب.</p></article>
          <article><span className="rule-index">02</span><Smartphone size={21} /><h3>احترم موعدك</h3><p>احضر في الوقت المتفق عليه. إذا تغيّرت خطتك، أبلغ صاحب الملعب أو فريقك مبكراً.</p></article>
          <article><span className="rule-index">03</span><UsersRound size={21} /><h3>احترم الجميع</h3><p>التزم بقوانين الشات والمباريات، وتحدث باحترام مع اللاعبين وأصحاب الملاعب.</p></article>
        </div>
      </section>

      <section className="download-support-card">
        <span className="download-support-icon"><Headphones size={22} /></span>
        <div><span className="eyebrow">نحن هنا للمساعدة</span><h2>واجهت مشكلة في التثبيت؟</h2><p>تواصل مع فريق البرازيلي وسنساعدك خطوة بخطوة.</p></div>
        <div className="download-support-actions">{supportNumbers.length ? supportNumbers.map((contact, index) => <a key={contact.number} href={contact.url} target="_blank" rel="noreferrer"><MessageCircle size={16} /> {supportNumbers.length > 1 ? `WhatsApp ${index + 1}` : "تواصل عبر WhatsApp"} <ArrowLeft size={16} /></a>) : <a href={supportLink} target={isExternalSupport ? "_blank" : undefined} rel={isExternalSupport ? "noreferrer" : undefined}>تواصل مع الدعم <ArrowLeft size={16} /></a>}</div>
      </section>

      <footer className="download-footer"><a href="/" className="download-footer-brand"><img src="/brzly-logo.svg" alt="" /> البرازيلي</a><span>© {new Date().getFullYear()} البرازيلي — اللعب يجمعنا.</span><a href="/support">الدعم والمساعدة</a></footer>
    </main>
  );
}
