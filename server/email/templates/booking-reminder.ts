import { appUrl, formatRemainingTime, renderEmail, type RenderedEmail } from "../layout";
import { bookingRows, type BookingEmailData } from "./booking-confirmation";

export function bookingReminderEmail(data: BookingEmailData, now = new Date()): RenderedEmail {
  const remaining = formatRemainingTime(data.startsAt, now);
  return renderEmail({
    subject: `تذكير: موعدك في ${data.pitchName} قريب`,
    preheader: `يتبقى ${remaining} على موعدك في ${data.pitchName}.`,
    heading: "ميعاد ماتشك قرب",
    intro: `يتبقى ${remaining} على بداية موعدك. راجع تفاصيل الملعب والوقت قبل انطلاق المباراة.`,
    recipientName: data.recipientName,
    rows: bookingRows(data),
    button: { label: "عرض تفاصيل الحجز", href: appUrl(`/open/booking/${data.bookingId}`) },
  });
}
