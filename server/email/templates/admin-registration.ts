import { appUrl, renderEmail, type RenderedEmail } from "../layout";

export function adminRegistrationEmail(input: { name: string; email: string; role: "player" | "owner" }): RenderedEmail {
  return renderEmail({
    subject: "تسجيل جديد في تطبيق البرازيلي",
    preheader: "اتعمل حساب جديد على المنصة.",
    heading: "حساب جديد انضم للمنصة",
    intro: "الحساب اتعمل بعد تأكيد الإيميل.",
    recipientName: "فريق الإدارة",
    rows: [
      { label: "اسم المستخدم", value: input.name },
      { label: "البريد الإلكتروني", value: input.email },
      { label: "نوع الحساب", value: input.role === "owner" ? "صاحب ملعب" : "لاعب" },
    ],
    button: { label: "افتح لوحة الإدارة", href: appUrl("/admin-dashboard/") },
  });
}
