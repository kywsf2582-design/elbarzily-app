import { describe, expect, it } from "vitest";
import { adminRegistrationEmail } from "./templates/admin-registration";
import { adminPitchSubmissionEmail } from "./templates/admin-pitch-submission";
import { bookingConfirmationEmail, type BookingEmailData } from "./templates/booking-confirmation";
import { bookingReminderEmail } from "./templates/booking-reminder";
import { bookingStatusEmail } from "./templates/booking-status";
import { verificationEmail } from "./templates/verification";
import { welcomeEmail } from "./templates/welcome";

const booking: BookingEmailData = {
  bookingId: 4821,
  recipientName: "أحمد لاعب",
  pitchName: "ملعب النخيل",
  fieldName: "الملعب الفرعي 2",
  address: "شارع النصر",
  city: "القاهرة",
  startsAt: new Date("2026-10-28T18:00:00+03:00"),
  endsAt: new Date("2026-10-28T19:00:00+03:00"),
  totalPrice: "850.00",
  paymentMethod: "deposit",
  paymentAmount: "250.00",
  receiptUrl: "https://files.example.test/private-receipt",
  status: "pending",
};

function withAppPublicUrl<T>(value: string | undefined, render: () => T): T {
  const previous = process.env.APP_PUBLIC_URL;
  if (value === undefined) delete process.env.APP_PUBLIC_URL;
  else process.env.APP_PUBLIC_URL = value;
  try {
    return render();
  } finally {
    if (previous === undefined) delete process.env.APP_PUBLIC_URL;
    else process.env.APP_PUBLIC_URL = previous;
  }
}

describe("branded email templates", () => {
  it("renders a six-digit OTP, Cairo expiry and safe warning without an unsupported verify link", () => {
    const email = verificationEmail({
      code: "482731",
      expiresAt: new Date("2026-10-28T12:10:00+03:00"),
      purpose: "register",
      recipientName: "<script>alert(1)</script>",
    });
    expect(email.subject).toContain("رمز");
    expect(email.html).toContain('lang="ar" dir="rtl"');
    expect(email.html).toContain("482731");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).not.toContain("<script>alert");
    expect(email.html).toContain("ما تبعتش الرمز ده لأي حد");
    expect(email.html).toContain("ينتهي الرمز في");
    expect(email.html).not.toContain("/verify");
    expect(email.text).toContain("482731");
    expect(email.text).toContain("البرازيلي — ملعبك، فريقك، ماتشك ⚽");
  });

  it("uses OTP for password reset as well as account registration", () => {
    const email = verificationEmail({
      code: "102938",
      expiresAt: new Date("2026-10-28T12:10:00+03:00"),
      purpose: "password_reset",
    });
    expect(email.subject).toContain("إعادة تعيين كلمة المرور");
    expect(email.html).toContain("استعادة حسابك");
    expect(email.text).toContain("102938");
  });

  it("renders welcome name, real account creation date, app CTA and plain text", () => {
    const email = withAppPublicUrl("https://elbarzily.example.test", () => welcomeEmail({ name: "سارة", createdAt: new Date("2026-10-20T12:00:00+03:00") }));
    expect(email.html).toContain("سارة");
    expect(email.html).toContain("تاريخ إنشاء الحساب");
    expect(email.html).toContain("افتح تطبيق البرازيلي");
    expect(email.html).toContain("https://elbarzily.example.test/open");
    expect(email.text).toContain("تاريخ إنشاء الحساب");
    expect(email.text).toContain("افتح تطبيق البرازيلي");
  });

  it("uses the new permanent origin when no public origin override is configured", () => {
    const email = withAppPublicUrl(undefined, () => welcomeEmail({ name: "سارة", createdAt: new Date("2026-10-20T12:00:00+03:00") }));
    expect(email.html).toContain("البرازيلي — ملعبك، فريقك، ماتشك ⚽");
    expect(email.html).toContain("https://elbarzily-espcslqj.manus.space/open");
    expect(email.html).not.toContain("elbarzily-tsfy8328.manus.space");
    expect(email.html).not.toContain('href="null/');
    expect(email.text).toContain("https://elbarzily-espcslqj.manus.space/");
  });

  it("keeps the administrator registration notice within the shared identity", () => {
    const email = withAppPublicUrl("https://elbarzily.example.test", () => adminRegistrationEmail({ name: "مريم", email: "mary@example.test", role: "owner" }));
    expect(email.html).toContain("mary@example.test");
    expect(email.html).toContain("صاحب ملعب");
    expect(email.html).toContain("تطبيق البرازيلي ⚽");
    expect(email.html).toContain("/admin-dashboard/");
    expect(email.text).toContain("mary@example.test");
  });

  it("sends the administrator all saved pitch, contact, price and field details", () => {
    const email = withAppPublicUrl("https://elbarzily.example.test", () => adminPitchSubmissionEmail({
      owner: { id: 51, name: "كابتن أحمد", email: "captain@example.test", phone: "01012345678" },
      pitch: {
        id: 82,
        name: "ملعب النخيل",
        description: "ملعب خماسي مضاء",
        address: "شارع النصر",
        city: "القاهرة",
        latitude: "30.0444000",
        longitude: "31.2357000",
        imageUrl: "https://files.example.test/pitch.jpg",
        mapUrl: "https://maps.example.test/pitch",
        captainName: "أحمد",
        captainPhone: "01012345678",
        vodafoneCashNumber: "01099887766",
        bookingPaymentMode: "deposit",
        depositAmount: "200.00",
        subPitchCount: 1,
        morningPrice: "500.00",
        eveningPrice: "700.00",
        status: "pending",
        amenities: ["إضاءة", "غرف تغيير"],
        createdAt: new Date("2026-10-28T12:00:00+03:00"),
        updatedAt: new Date("2026-10-29T12:00:00+03:00"),
      },
      fields: [{ name: "ملعب 1", sport: "football", capacity: 12, hourlyPrice: "700.00", isActive: true }],
      submittedAt: new Date("2026-10-29T12:00:00+03:00"),
      updated: false,
    }));

    expect(email.subject).toContain("ملعب النخيل");
    expect(email.html).toContain("captain@example.test");
    expect(email.html).toContain("01012345678");
    expect(email.html).toContain("https://maps.example.test/pitch");
    expect(email.html).toContain("تفاصيل الملاعب الفرعية");
    expect(email.html).toContain("رقم Vodafone Cash");
    expect(email.html).toContain("/admin-dashboard/");
    expect(email.text).toContain("شارع النصر");
    expect(email.text).toContain("غرف تغيير");
  });

  it("includes truthful booking, payment and venue fields after booking creation", () => {
    const email = withAppPublicUrl("https://elbarzily.example.test", () => bookingConfirmationEmail(booking));
    expect(email.html).toContain("#4821");
    expect(email.html).toContain("ملعب النخيل — الملعب الفرعي 2");
    expect(email.html).toContain("شارع النصر");
    expect(email.html).toContain("السعر الإجمالي");
    expect(email.html).toContain("٨٥٠");
    expect(email.html).toContain("مستنيين تأكيد صاحب الملعب");
    expect(email.html).toContain("الإيصال مرفق — مستني مراجعة صاحب الملعب");
    expect(email.html).not.toContain("private-receipt");
    expect(email.html).toContain("اعرض تفاصيل الحجز");
    expect(email.html).toContain("/open/booking/4821");
    expect(email.text).toContain("#4821");
  });

  it("renders the reminder countdown using the supplied clock and real schedule fields", () => {
    const now = new Date("2026-10-28T17:00:00+03:00");
    const email = withAppPublicUrl("https://elbarzily.example.test", () => bookingReminderEmail({ ...booking, status: "approved" }, now));
    expect(email.subject).toContain("ملعب النخيل");
    expect(email.html).toContain("ميعاد ماتشك قرب");
    expect(email.html).toContain("فاضل 1 ساعة");
    expect(email.html).toContain("وقت البداية");
    expect(email.html).toContain("/open/booking/4821");
    expect(email.text).toContain("رقم الحجز: #4821");
  });

  it("renders status changes, old/new appointments and only an explicit refund status", () => {
    const changed = withAppPublicUrl("https://elbarzily.example.test", () => bookingStatusEmail({
      ...booking,
      status: "approved",
      reason: "تم تأكيد الموعد",
      previousStartsAt: new Date("2026-10-28T15:00:00+03:00"),
      previousEndsAt: new Date("2026-10-28T16:00:00+03:00"),
      newStartsAt: new Date("2026-10-28T18:00:00+03:00"),
      newEndsAt: new Date("2026-10-28T19:00:00+03:00"),
    }));
    expect(changed.html).toContain("الحجز اتأكد");
    expect(changed.html).toContain("سبب التغيير");
    expect(changed.html).toContain("الموعد السابق");
    expect(changed.html).toContain("الموعد الجديد");
    expect(changed.html).not.toContain("حالة الاسترداد");

    const cancelled = withAppPublicUrl("https://elbarzily.example.test", () => bookingStatusEmail({ ...booking, status: "cancelled" }));
    expect(cancelled.html).toContain("الحجز اتلغى");
    expect(cancelled.html).toContain("/open/booking/4821");
    expect(cancelled.html).toContain("مفيش استرداد متسجل للحجز ده في التطبيق");
    expect(cancelled.text).toContain("الرسالة دي مش تأكيد إن أي مبلغ اترجع");
  });
});
