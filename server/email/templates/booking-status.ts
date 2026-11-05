import { appUrl, renderEmail, type RenderedEmail } from "../layout";
import { bookingRows, bookingStatusLabel, type BookingEmailData } from "./booking-confirmation";

export function bookingStatusEmail(data: BookingEmailData): RenderedEmail {
  const cancelled = data.status === "cancelled";
  const approved = data.status === "approved";
  const heading = cancelled ? "تم إلغاء الحجز" : approved ? "تم تأكيد الحجز" : data.status === "rejected" ? "تحديث على طلب حجزك" : "تحديث حالة الحجز";
  return renderEmail({
    subject: `${cancelled ? "إلغاء" : approved ? "تأكيد" : "تحديث"} الحجز #${data.bookingId}`,
    preheader: `حالة الحجز #${data.bookingId}: ${bookingStatusLabel(data.status)}.`,
    heading,
    intro: cancelled
      ? "تم تسجيل إلغاء هذا الحجز في التطبيق. راجع التفاصيل أدناه، وتواصل مع الملعب أو الدعم بشأن أي استفسار مالي."
      : approved
        ? "أكد صاحب الملعب حجزك. احتفظ بالتفاصيل ورمز QR المتاح داخل حسابك."
        : data.status === "rejected"
          ? "حدّث صاحب الملعب حالة طلبك. تجد السبب والتفاصيل المسجلة أدناه إن توفرت."
          : "تغيرت حالة طلب الحجز. هذه أحدث التفاصيل المسجلة في التطبيق.",
    recipientName: data.recipientName,
    rows: bookingRows(data),
    notice: cancelled && Number(data.paymentAmount) > 0
      ? "لا يسجل التطبيق حالة استرداد مستقلة لهذا الحجز؛ لم يتم تأكيد رد أي مبلغ بهذه الرسالة."
      : null,
    button: { label: "عرض تفاصيل الحجز", href: appUrl(`/open/booking/${data.bookingId}`) },
  });
}
