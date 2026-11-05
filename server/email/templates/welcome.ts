import { appUrl, formatCairoDateTime, renderEmail, type RenderedEmail } from "../layout";

export function welcomeEmail(input: { name: string | null; createdAt: Date | string }): RenderedEmail {
  return renderEmail({
    subject: "أهلاً بك في تطبيق البرازيلي ⚽",
    preheader: "حسابك أصبح جاهزاً—اختر ملعبك وابدأ المباراة.",
    heading: "أهلاً بك في فريق البرازيلي",
    intro: "سعداء بانضمامك. احجز ملعبك، تابع فريقك، وخلي المباراة تبدأ.",
    recipientName: input.name,
    rows: [{ label: "تاريخ إنشاء الحساب", value: formatCairoDateTime(input.createdAt) }],
    button: { label: "افتح تطبيق البرازيلي", href: appUrl("/open") },
  });
}
