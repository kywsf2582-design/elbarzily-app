import { appUrl, formatRemainingTime, renderEmail, type RenderedEmail } from "../layout";
import { bookingRows, type BookingEmailData } from "./booking-confirmation";

export function bookingReminderEmail(data: BookingEmailData, now = new Date()): RenderedEmail {
  const remaining = formatRemainingTime(data.startsAt, now);
  return renderEmail({
    subject: `تذكير: ميعادك في ${data.pitchName} قرب`,
    preheader: `فاضل ${remaining} على ميعادك في ${data.pitchName}.`,
    heading: "ميعاد ماتشك قرب",
    intro: `فاضل ${remaining} على بداية ميعادك. راجع تفاصيل الملعب والوقت قبل الماتش.`,
    recipientName: data.recipientName,
    rows: bookingRows(data),
    button: { label: "عرض تفاصيل الحجز", href: appUrl(`/open/booking/${data.bookingId}`) },
  });
}
