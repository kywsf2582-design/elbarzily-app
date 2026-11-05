import { appUrl, formatCairoDate, formatCairoTime, formatEgp, renderEmail, type RenderedEmail } from "../layout";

export type BookingEmailData = {
  bookingId: number;
  recipientName: string | null;
  pitchName: string;
  fieldName: string | null;
  address: string | null;
  city: string | null;
  startsAt: Date | string;
  endsAt: Date | string;
  totalPrice: string | number;
  paymentMethod: "arrival" | "deposit" | "full";
  paymentAmount: string | number;
  receiptUrl: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  reason?: string | null;
  previousStartsAt?: Date | string | null;
  previousEndsAt?: Date | string | null;
  newStartsAt?: Date | string | null;
  newEndsAt?: Date | string | null;
};

export function bookingStatusLabel(status: BookingEmailData["status"]): string {
  return ({
    pending: "بانتظار تأكيد صاحب الملعب",
    approved: "مؤكد",
    rejected: "مرفوض",
    cancelled: "ملغي",
  })[status];
}

export function paymentStatusLabel(data: BookingEmailData): string {
  if (data.paymentMethod === "arrival") return "الدفع عند الوصول";
  if (data.receiptUrl) return "إيصال مرفق — بانتظار مراجعة صاحب الملعب";
  return "لا توجد حالة تحصيل مؤكدة في سجل الحجز";
}

function venueAddress(data: BookingEmailData): string {
  const parts = [data.address, data.city].map(value => value?.trim()).filter(Boolean);
  return parts.join("، ") || "لم يُسجل عنوان للملعب";
}

export function bookingRows(data: BookingEmailData) {
  const rows = [
    { label: "رقم الحجز", value: `#${data.bookingId}` },
    { label: "الملعب", value: `${data.pitchName}${data.fieldName ? ` — ${data.fieldName}` : ""}` },
    { label: "العنوان", value: venueAddress(data) },
    { label: "التاريخ", value: formatCairoDate(data.startsAt) },
    { label: "وقت البداية", value: formatCairoTime(data.startsAt) },
    { label: "وقت النهاية", value: formatCairoTime(data.endsAt) },
    { label: "السعر الإجمالي", value: formatEgp(data.totalPrice) },
    { label: "حالة الحجز", value: bookingStatusLabel(data.status) },
    { label: "حالة الدفع", value: paymentStatusLabel(data) },
  ];
  if (data.reason?.trim()) rows.push({ label: "سبب التغيير", value: data.reason.trim() });
  if (data.previousStartsAt) {
    const previous = `${formatCairoDate(data.previousStartsAt)}، ${formatCairoTime(data.previousStartsAt)}${data.previousEndsAt ? `–${formatCairoTime(data.previousEndsAt)}` : ""}`;
    rows.push({ label: "الموعد السابق", value: previous });
  }
  if (data.newStartsAt) {
    const next = `${formatCairoDate(data.newStartsAt)}، ${formatCairoTime(data.newStartsAt)}${data.newEndsAt ? `–${formatCairoTime(data.newEndsAt)}` : ""}`;
    rows.push({ label: "الموعد الجديد", value: next });
  }
  if (data.status === "cancelled" && Number(data.paymentAmount) > 0) {
    rows.push({ label: "حالة الاسترداد", value: "لا توجد حالة استرداد مسجلة لهذا الحجز في التطبيق" });
  }
  return rows;
}

export function bookingConfirmationEmail(data: BookingEmailData): RenderedEmail {
  return renderEmail({
    subject: data.status === "pending" ? `استلمنا طلب حجزك #${data.bookingId}` : `حالة حجزك #${data.bookingId}`,
    preheader: `طلب الحجز #${data.bookingId} في ${data.pitchName}.`,
    heading: data.status === "pending" ? "استلمنا طلب حجزك" : `حالة الحجز: ${bookingStatusLabel(data.status)}`,
    intro: data.status === "pending"
      ? "سجلنا طلبك بنجاح. الحجز الآن بانتظار مراجعة صاحب الملعب، وسنرسل لك تحديثاً عند تغير الحالة."
      : "هذه تفاصيل طلب الحجز وحالته الحالية كما سُجلت في التطبيق.",
    recipientName: data.recipientName,
    rows: bookingRows(data),
    button: { label: "عرض تفاصيل الحجز", href: appUrl(`/open/booking/${data.bookingId}`) },
  });
}
