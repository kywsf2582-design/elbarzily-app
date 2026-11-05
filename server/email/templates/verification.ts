import { formatCairoDateTime, renderEmail, type RenderedEmail } from "../layout";

export type VerificationPurpose = "register" | "password_reset";

const copy: Record<VerificationPurpose, { subject: string; heading: string; intro: string }> = {
  register: { subject: "رمز تفعيل حسابك في البرازيلي", heading: "أكد بريدك الإلكتروني", intro: "أدخل الرمز في شاشة التسجيل لإكمال إنشاء حسابك." },
  password_reset: { subject: "رمز إعادة تعيين كلمة المرور", heading: "استعادة حسابك", intro: "أدخل الرمز في شاشة استعادة الحساب لإكمال تغيير كلمة المرور." },
};

export function verificationEmail(input: {
  code: string;
  expiresAt: Date;
  purpose: VerificationPurpose;
  recipientName?: string | null;
}): RenderedEmail {
  const message = copy[input.purpose];
  return renderEmail({
    subject: message.subject,
    preheader: `${message.heading} — صالح حتى ${formatCairoDateTime(input.expiresAt)}.`,
    heading: message.heading,
    intro: message.intro,
    recipientName: input.recipientName,
    highlight: { label: "رمزك المكوّن من 6 أرقام", value: input.code },
    rows: [{ label: "ينتهي الرمز في", value: formatCairoDateTime(input.expiresAt) }],
    notice: "لأمان حسابك، لا تشارك هذا الرمز مع أي شخص. إذا لم تطلبه، تجاهل هذه الرسالة.",
  });
}
