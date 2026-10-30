import { appUrl, renderEmail, type RenderedEmail } from "../layout";

export function adminRegistrationEmail(input: { name: string; email: string; role: "player" | "owner" }): RenderedEmail {
  return renderEmail({
    subject: "تسجيل جديد في تطبيق البرازيلي",
    preheader: "تم إنشاء حساب جديد على المنصة.",
    heading: "حساب جديد انضم للمنصة",
    intro: "أُنشئ الحساب بعد إتمام التحقق من البريد الإلكتروني.",
    recipientName: "فريق الإدارة",
    rows: [
      { label: "اسم العميل", value: input.name },
      { label: "البريد الإلكتروني", value: input.email },
      { label: "نوع الحساب", value: input.role === "owner" ? "صاحب ملعب" : "لاعب" },
    ],
    button: { label: "فتح لوحة الإدارة", href: appUrl("/admin-dashboard/") },
  });
}
