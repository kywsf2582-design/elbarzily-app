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
const BUNDLED_APK_FILE_NAME = "ElBarzily-Android-2.0.6-native-picker.apk";
const BUNDLED_APK_URL = `/downloads/${BUNDLED_APK_FILE_NAME}`;
const BUNDLED_APK_VERSION = "2.0.6";
const WINDOWS_RELEASE_VERSION = "1.1.0";
const WINDOWS_RELEASE_FILE_NAME = "ElBarzily-Windows-1.1.0.exe";
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
    const onInstalled = () => { setInstallPrompt(null); setInstallMessage("البرازيلي اتثبت كتطبيق على الجهاز ده."); };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onBeforeInstall); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  // The APK is also bundled in Pages so it remains downloadable if Neon settings or the API are unavailable.
  const downloadAvailable = true;
  const windowsAvailable = Boolean(settings?.windowsAvailable);
  const effectiveApkVersion = BUNDLED_APK_VERSION;
  const hasNewerApk = Boolean(downloadAvailable && (!lastRequestedVersion || compareVersions(effectiveApkVersion, lastRequestedVersion) > 0));
  const supportLink = settings?.supportLink || "/support";
  const isExternalSupport = supportIsExternal(supportLink);
  const supportNumbers = settings?.supportNumbers ?? [];
  const isDesktopDevice = device === "windows" || device === "desktop";
  const ctaLabel = device === "android" ? "نزّل التطبيق دلوقتي" : "نزّل تطبيق Android (APK)";
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
        const version = BUNDLED_APK_VERSION;
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
      setDownloadError("ماقدرناش نبدأ التنزيل دلوقتي. جرّب تاني كمان شوية؛ مفيش عملية تنزيل اتسجلت.");
    }
  };
  const deviceMessage = device === "android"
    ? "التنزيل جاهز لموبايلك. افتح الملف واتبع خطوات التثبيت اللي هيظهرها Android."
    : device === "ios"
      ? "النسخة دي ملف Android APK ومش هتتثبت على iPhone أو iPad."
      : device === "windows"
        ? windowsAvailable ? "نسخة Windows Desktop جاهزة؛ تشغيلها محتاج إنترنت." : "تقدر تثبّت البرازيلي كتطبيق Desktop من Edge أو Chrome."
        : windowsAvailable ? "تقدر تنزّل APK لموبايل Android أو ملف Windows Desktop (.exe) للكمبيوتر ده." : "تقدر تنزّل ملف APK على الكمبيوتر، بس تثبيته محتاج موبايل أو جهاز Android.";
  const installDesktop = async () => {
    if (!installPrompt) {
      setInstallMessage("من قايمة Edge أو Chrome، اختار Apps وبعدها Install this site as an app.");
      return;
    }
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallMessage(choice.outcome === "accepted" ? "بنثبّت تطبيق البرازيلي على Windows." : "تقدر تثبّته بعدين من قايمة المتصفح.");
      setInstallPrompt(null);
    } catch { setInstallMessage("افتح قايمة Edge أو Chrome واختار تثبيت الموقع ده كتطبيق."); }
  };

  return (
    <main className="download-page" dir="rtl">
      <div className="download-page-glow download-page-glow-one" aria-hidden="true" />
      <div className="download-page-glow download-page-glow-two" aria-hidden="true" />
      <header className="download-topbar">
        <a className="download-brand" href="/" aria-label="البرازيلي — الصفحة الرئيسية">
          <img src="/brzly-logo.svg" alt="" />
          <span><b>البرازيلي</b><small>الكورة قربت. ملعبك جاهز.</small></span>
        </a>
        <a className="download-header-link" href="/">ارجع للموقع <ArrowLeft size={15} /></a>
      </header>

      <section className="download-hero">
        <div className="download-hero-copy">
          <span className="download-kicker"><span /> {settings?.appName || "تطبيق البرازيلي الرسمي"}</span>
          <h1>اللعب بيبدأ<br /><em>من هنا.</em></h1>
          <p className="download-lede">ملاعبك ومواعيدك وفريقك المفضل — كلهم في تطبيق واحد معمول لعشاق الكورة.</p>
        <span className="download-version">النسخة {device === "windows" ? WINDOWS_RELEASE_VERSION : effectiveApkVersion}</span>
          {downloadAvailable ? (
            <button className="download-main-cta" type="button" disabled={requestDownload.isPending} onClick={() => void beginDownload("android")}>
              <span className="download-cta-icon">{requestDownload.isPending ? <LoaderCircle className="spin" size={23} /> : <Download size={23} />}</span>
              <span><b>{ctaLabel}</b><small>ملف التطبيق الرسمي · {BUNDLED_APK_FILE_NAME}</small></span>
              <ArrowLeft className="download-cta-arrow" size={19} />
            </button>
          ) : (
            <button className="download-main-cta is-disabled" type="button" disabled>
              <span className="download-cta-icon"><Download size={23} /></span>
              <span><b>{query.isLoading ? "بنجهّز رابط التنزيل" : "التطبيق مش متاح للتنزيل دلوقتي"}</b><small>جرّب تاني بعدين أو كلم الدعم</small></span>
            </button>
          )}
          {device === "android" && downloadAvailable && (hasNewerApk ? <button className="download-update-cta" type="button" disabled={requestDownload.isPending} onClick={() => void beginDownload("android")}>
            <span>{requestDownload.isPending ? <LoaderCircle className="spin" size={17} /> : <Download size={17} />}<b>نزّل آخر تحديث</b></span><small>{lastRequestedVersion ? `لقينا نسخة أحدث: ${effectiveApkVersion}.` : `أحدث APK متاح هو ${effectiveApkVersion}.`} التنزيل هيبدأ فوراً؛ لازم تأكد التثبيت على Android.</small>
          </button> : <p className="download-windows-pending">آخر نسخة طلبت تنزيلها على الجهاز ده هي {lastRequestedVersion || effectiveApkVersion}. لو التنزيل أو التثبيت ماكملش، تقدر تنزّل النسخة الحالية تاني من الزر اللي فوق.</p>)}
          {(windowsAvailable || isDesktopDevice) && <div className="download-windows-options">
            {windowsAvailable ? <button className="download-windows-cta" type="button" disabled={requestDownload.isPending} onClick={() => void beginDownload("windows")}><span>{requestDownload.isPending ? <LoaderCircle className="spin" size={18} /> : <Download size={18} />} تنزيل Windows Desktop (.exe)</span><small>{WINDOWS_RELEASE_FILE_NAME} · x64 · محتاج إنترنت</small></button> : <p className="download-windows-pending">لسه ملف EXE ما اترفعش؛ تقدر تثبّت نسخة Desktop دلوقتي كتطبيق ويب من المتصفح.</p>}
            {isDesktopDevice && <button className="download-update-cta" type="button" onClick={installDesktop}><span><Smartphone size={17} /><b>{installPrompt ? "ثبّت تطبيق البرازيلي على Windows" : "ثبّت كتطبيق Desktop"}</b></span><small>إضافة آمنة من المتصفح؛ مش محتاجة ملف تثبيت لوحده.</small></button>}
            {installMessage && <p className="download-device-note">{installMessage}</p>}
          </div>}
          {downloadError && <p className="download-error" role="alert">{downloadError}</p>}
          <p className="download-device-note"><Smartphone size={15} />{deviceMessage}</p>
          {query.isError && <p className="download-device-note">ماقدرناش نحمّل إعدادات التنزيل؛ نزّل ملف APK اللي فوق، وإحصائيات التنزيل ممكن تتأخر لحد ما النت يرجع.</p>}
          <div className="download-trust-row"><span><ShieldCheck size={15} /> رابط رسمي</span><span><Check size={15} /> تنزيل مباشر</span></div>
        </div>

        <div className="download-hero-art" aria-label="تطبيق البرازيلي للكورة">
          <div className="download-art-orbit orbit-one" />
          <div className="download-art-orbit orbit-two" />
          <div className="download-art-ball"><Trophy size={45} strokeWidth={1.35} /></div>
          <div className="download-art-card download-art-card-top"><span className="art-card-icon"><Smartphone size={16} /></span><span><b>كل الملاعب في جيبك</b><small>اختار، احجز، والعب</small></span><span className="art-live-dot" /></div>
          <div className="download-art-card download-art-card-bottom"><span className="art-card-icon"><UsersRound size={16} /></span><span><b>فريقك مستنيك</b><small>ماتشات قريبة منك</small></span><ArrowLeft size={15} /></div>
          <span className="download-art-caption">EL BARZILY <i>·</i> العبوا سوا</span>
        </div>
      </section>

      <section className="download-benefits" aria-label="مميزات التطبيق">
        <article><span><Smartphone size={18} /></span><div><b>من موبايلك</b><small>كل حاجة في مكان واحد</small></div></article>
        <article><span><Trophy size={18} /></span><div><b>ماتشات أحلى</b><small>كوّن فريقك والعب</small></div></article>
        <article><span><UsersRound size={18} /></span><div><b>ملاعب مضمونة</b><small>احجز معادك بسهولة</small></div></article>
      </section>

      <section className="download-lower-section" id="install">
        <div className="download-section-heading"><span className="download-kicker"><span /> تثبيت سهل وآمن</span><h2>في دقيقة،<br /><em>تبقى جاهز.</em></h2><p>امشي على الخطوات دي على Android. أسماء القوايم ممكن تختلف شوية حسب جهازك.</p></div>
        <div className="download-steps">
          <article><span className="step-number">01</span><span className="step-icon"><ArrowDownToLine size={20} /></span><div><h3>نزّل التطبيق</h3><p>اضغط «نزّل التطبيق دلوقتي» وانتظر اكتمال تنزيل ملف APK على هاتفك.</p></div></article>
          <article><span className="step-number">02</span><span className="step-icon"><CircleHelp size={20} /></span><div><h3>اسمح بالتثبيت</h3><p>لو ظهرت رسالة أمان، اختار «الإعدادات» وبعدها فعّل «السماح من هذا المصدر» للمتصفح اللي نزّلت منه الملف.</p></div></article>
          <article><span className="step-number">03</span><span className="step-icon"><Smartphone size={20} /></span><div><h3>ثبّت وافتح التطبيق</h3><p>ارجع لملف APK واضغط «تثبيت». بعد ما يثبت، افتح التطبيق وسجّل دخولك.</p></div></article>
          <article><span className="step-number">04</span><span className="step-icon"><ShieldCheck size={20} /></span><div><h3>اقفل السماح بعد كده</h3><p>عشان أمان جهازك، تقدر تلغي «السماح من هذا المصدر» بعد التثبيت من إعدادات المتصفح.</p></div></article>
        </div>
      </section>

      <section className="download-rules-section">
        <div className="download-section-heading"><span className="download-kicker"><span /> نلعب باحترام</span><h2>روح الملعب<br /><em>مسؤولية كلنا.</em></h2><p>التزامك بيخلّي اللعب عادل وآمن لكل اللاعبين وأصحاب الملاعب.</p></div>
        <div className="download-rules-grid">
          <article><span className="rule-index">01</span><ShieldCheck size={21} /><h3>إيصالات حقيقية وبس</h3><p>ماترفقش إيصال تحويل مزيف أو متعدل. التلاعب بالدفع ممكن يوقف حسابك.</p></article>
          <article><span className="rule-index">02</span><Smartphone size={21} /><h3>احترم معادك</h3><p>احضر في المعاد المتفق عليه. لو خطتك اتغيرت، بلّغ صاحب الملعب أو فريقك بدري.</p></article>
          <article><span className="rule-index">03</span><UsersRound size={21} /><h3>احترم كل الناس</h3><p>التزم بقواعد الشات والماتشات، واتكلم باحترام مع اللاعبين وأصحاب الملاعب.</p></article>
        </div>
      </section>

      <section className="download-support-card">
        <span className="download-support-icon"><Headphones size={22} /></span>
        <div><span className="eyebrow">إحنا هنا عشان نساعدك</span><h2>فيه مشكلة في التثبيت؟</h2><p>كلم فريق البرازيلي وهنمشي معاك خطوة بخطوة.</p></div>
        <div className="download-support-actions">{supportNumbers.length ? supportNumbers.map((contact, index) => <a key={contact.number} href={contact.url} target="_blank" rel="noreferrer"><MessageCircle size={16} /> {supportNumbers.length > 1 ? `واتساب ${index + 1}` : "كلمنا على واتساب"} <ArrowLeft size={16} /></a>) : <a href={supportLink} target={isExternalSupport ? "_blank" : undefined} rel={isExternalSupport ? "noreferrer" : undefined}>كلم الدعم <ArrowLeft size={16} /></a>}</div>
      </section>

      <footer className="download-footer"><a href="/" className="download-footer-brand"><img src="/brzly-logo.svg" alt="" /> البرازيلي</a><span>© {new Date().getFullYear()} البرازيلي — اللعب بيجمعنا.</span><a href="/support">الدعم والمساعدة</a></footer>
    </main>
  );
}
