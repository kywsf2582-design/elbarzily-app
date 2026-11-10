import { formatCairoDateTime, renderEmail, type RenderedEmail } from "../layout";

export type VerificationPurpose = "register" | "password_reset";

const copy: Record<VerificationPurpose, { subject: string; heading: string; intro: string }> = {
  register: { subject: "رمز تفعيل حسابك في البرازيلي", heading: "أكد إيميلك", intro: "اكتب الرمز في شاشة التسجيل عشان تكمّل إنشاء حسابك." },
  password_reset: { subject: "رمز إعادة تعيين كلمة المرور", heading: "استعادة حسابك", intro: "اكتب الرمز في شاشة استعادة الحساب عشان تكمّل تغيير كلمة السر." },
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
    highlight: { label: "الرمز المكوّن من ٦ أرقام", value: input.code },
    rows: [{ label: "ينتهي الرمز في", value: formatCairoDateTime(input.expiresAt) }],
    notice: "عشان تحافظ على أمان حسابك، ما تبعتش الرمز ده لأي حد. لو ما طلبتوش، تجاهل الرسالة دي.",
  });
}
