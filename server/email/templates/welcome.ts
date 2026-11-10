import { appUrl, formatCairoDateTime, renderEmail, type RenderedEmail } from "../layout";

export function welcomeEmail(input: { name: string | null; createdAt: Date | string }): RenderedEmail {
  return renderEmail({
    subject: "أهلاً بك في تطبيق البرازيلي ⚽",
    preheader: "حسابك بقى جاهز—اختار ملعبك وخلي الماتش يبدأ.",
    heading: "أهلاً بيك في فريق البرازيلي",
    intro: "مبسوطين إنك بقيت معانا! احجز ملعبك وتابع فريقك وخلي الماتش يبدأ.",
    recipientName: input.name,
    rows: [{ label: "تاريخ إنشاء الحساب", value: formatCairoDateTime(input.createdAt) }],
    button: { label: "افتح تطبيق البرازيلي", href: appUrl("/open") },
  });
}
