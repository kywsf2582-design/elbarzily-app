import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, CalendarDays, CircleUserRound, Compass, Gift, Trophy, Users, X,
} from "lucide-react";

const steps = [
  {
    title: "أهلاً بيك في البرازيلي يا نجم",
    description: "هتلاقي ملاعب وماتشات، تحجز وتلعب، وتكسب نقط لما صاحبك الجديد يفعّل حسابه ويكمّل بياناته. مجرد الضغط على مشاركة مش بيدي نقط. يلا نلف لفة سريعة!",
    icon: Trophy,
  },
  {
    title: "الرئيسية",
    description: "هتلاقي هنا الملاعب والماتشات السريعة، وتوصل للي يناسبك من أولها.",
    icon: Compass,
  },
  {
    title: "احجز",
    description: "اختار منطقتك ويوم اللعب، نقّي الملعب والميعاد المتاح اللي يناسبك، وبعدها ابعت طلب الحجز.",
    icon: CalendarDays,
  },
  {
    title: "العب",
    description: "شوف الماتشات المفتوحة وانضم للي يناسبك، أو افتح ماتشك ولمّ السكواد لحد ما يكمل.",
    icon: Trophy,
  },
  {
    title: "السكواد",
    description: "لمّ أصحابك، رتّب فريقك، وابقوا جاهزين للماتش الجاي.",
    icon: Users,
  },
  {
    title: "المكافآت والدعوات",
    description: "انسخ لينكك أو شاركه على واتساب أو من زر المشاركة. النقط بتتحسب لما صاحبك يسجّل بإيميله المتأكد ويكمّل ملفه؛ ومكافأة أول حجز بتحتاج QR يتراجع من صاحب الملعب.",
    icon: Gift,
  },
  {
    title: "حسابي/المزيد",
    description: "من هنا تظبّط إعداداتك، تراجع البروفايل، وتوصل للدعم والخدمات التانية.",
    icon: CircleUserRound,
  },
];

type OnboardingTourProps = { userId: number | null };

export default function OnboardingTour({ userId }: OnboardingTourProps) {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const dialogRef = useRef<HTMLElement | null>(null);
  const storageKey = userId ? `brzly-onboarding-v1-${userId}` : "";
  const step = steps[stepIndex];
  const StepIcon = step.icon;

  useEffect(() => {
    setOpen(false);
    setStepIndex(0);
    if (!storageKey) {
      return;
    }
    let alreadySeen = false;
    try { alreadySeen = window.localStorage.getItem(storageKey) === "done"; }
    catch { alreadySeen = false; }
    if (alreadySeen) return;
    const timer = window.setTimeout(() => setOpen(true), 650);
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const finish = () => {
    try { if (storageKey) window.localStorage.setItem(storageKey, "done"); }
    catch { /* The tour remains dismissible for this visit if storage is disabled. */ }
    setOpen(false);
  };
  const next = () => stepIndex === steps.length - 1 ? finish() : setStepIndex(index => index + 1);
  const previous = () => setStepIndex(index => Math.max(0, index - 1));

  if (!open || !userId) return null;

  return (
    <div className="onboarding-backdrop">
      <section className="onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="onboarding-title" aria-describedby="onboarding-description" dir="rtl" tabIndex={-1} ref={dialogRef}>
        <header className="onboarding-header">
          <div><span className="eyebrow">دليلك في البرازيلي</span><small>خطوة {stepIndex + 1} من {steps.length}</small></div>
          <button type="button" className="onboarding-close" onClick={finish} aria-label="عدّي الجولة"><X size={18} /></button>
        </header>
        <div className="onboarding-progress" aria-hidden="true"><span style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} /></div>
        <div className="onboarding-step-content" aria-live="polite">
          <span className="onboarding-icon"><StepIcon size={27} /></span>
          <h2 id="onboarding-title">{step.title}</h2>
          <p id="onboarding-description">{step.description}</p>
        </div>
        <div className="onboarding-actions">
          <button type="button" className="button-outline onboarding-skip" onClick={finish}>عدّي الجولة</button>
          <div className="onboarding-step-actions">
            {stepIndex > 0 && <button type="button" className="button-outline" onClick={previous}>اللي فات</button>}
            <button type="button" className="button-primary" onClick={next}>{stepIndex === steps.length - 1 ? "يلا بينا نبدأ" : "اللي بعده"}<ArrowLeft size={15} /></button>
          </div>
        </div>
      </section>
    </div>
  );
}
