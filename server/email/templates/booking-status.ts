import { appUrl, renderEmail, type RenderedEmail } from "../layout";
import { bookingRows, bookingStatusLabel, type BookingEmailData } from "./booking-confirmation";

export function bookingStatusEmail(data: BookingEmailData): RenderedEmail {
  const cancelled = data.status === "cancelled";
  const approved = data.status === "approved";
  const heading = cancelled ? "الحجز اتلغى" : approved ? "الحجز اتأكد" : data.status === "rejected" ? "فيه تحديث على طلب حجزك" : "تحديث على حالة الحجز";
  return renderEmail({
    subject: `${cancelled ? "إلغاء" : approved ? "تأكيد" : "تحديث"} الحجز #${data.bookingId}`,
    preheader: `حالة الحجز رقم #${data.bookingId}: ${bookingStatusLabel(data.status)}.`,
    heading,
    intro: cancelled
      ? "اتسجل إلغاء الحجز ده في التطبيق. راجع التفاصيل تحت، ولو عندك استفسار عن الفلوس كلم الملعب أو الدعم."
      : approved
        ? "صاحب الملعب أكد حجزك. احتفظ بالتفاصيل ورمز QR الموجود في حسابك."
        : data.status === "rejected"
          ? "صاحب الملعب حدّث حالة طلبك. هتلاقي السبب والتفاصيل المسجلة تحت لو متاحة."
          : "حالة طلب الحجز اتغيرت. دي آخر التفاصيل المسجلة في التطبيق.",
    recipientName: data.recipientName,
    rows: bookingRows(data),
    notice: cancelled && Number(data.paymentAmount) > 0
      ? "التطبيق ما بيسجلش حالة استرداد منفصلة للحجز ده؛ والرسالة دي مش تأكيد إن أي مبلغ اترجع."
      : null,
    button: { label: "اعرض تفاصيل الحجز", href: appUrl(`/open/booking/${data.bookingId}`) },
  });
}
