import { appUrl, formatCairoDateTime, formatEgp, renderEmail, type RenderedEmail } from "../layout";

export type AdminPitchSubmissionInput = {
  owner: { id: number; name: string | null; email: string | null; phone: string | null };
  pitch: {
    id: number;
    name: string;
    description: string | null;
    address: string;
    city: string;
    latitude: string | number | null;
    longitude: string | number | null;
    imageUrl: string | null;
    mapUrl: string | null;
    captainName: string | null;
    captainPhone: string | null;
    vodafoneCashNumber: string | null;
    bookingPaymentMode: "arrival" | "deposit";
    depositAmount: string | number | null;
    subPitchCount: number;
    morningPrice: string | number | null;
    eveningPrice: string | number | null;
    status: string;
    amenities: unknown;
    createdAt: Date | string;
    updatedAt: Date | string;
  };
  fields: Array<{
    name: string;
    sport: string;
    capacity: number;
    hourlyPrice: string | number;
    isActive: boolean;
  }>;
  submittedAt: Date;
  updated: boolean;
};

function jsonText(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function statusText(status: string): string {
  return ({
    draft: "مسودة بانتظار المراجعة",
    pending: "قيد مراجعة الإدارة",
    published: "منشور",
    rejected: "مرفوض",
    suspended: "موقوف",
  } as Record<string, string>)[status] || status;
}

export function adminPitchSubmissionEmail(input: AdminPitchSubmissionInput): RenderedEmail {
  const { owner, pitch } = input;
  const fieldDetails = input.fields.length
    ? input.fields.map(field => `${field.name} — ${field.sport} — سعة ${field.capacity} — ${formatEgp(field.hourlyPrice)} للساعة — ${field.isActive ? "نشط" : "موقوف"}`).join("؛ ")
    : "لا توجد ملاعب فرعية مسجلة";
  const coordinates = pitch.latitude != null || pitch.longitude != null
    ? `${pitch.latitude ?? "غير متاح"}، ${pitch.longitude ?? "غير متاح"}`
    : null;
  const paymentMode = pitch.bookingPaymentMode === "deposit" ? "عربون مسبق" : "الدفع عند الوصول";
  const amenities = jsonText(pitch.amenities);
  const rows = [
    { label: "رقم طلب المراجعة", value: pitch.id },
    { label: "حالة الملعب", value: statusText(pitch.status) },
    { label: "اسم الملعب", value: pitch.name },
    { label: "وصف الملعب", value: pitch.description },
    { label: "المدينة أو المحافظة", value: pitch.city },
    { label: "العنوان والمنطقة", value: pitch.address },
    { label: "رابط Google Maps", value: pitch.mapUrl },
    { label: "الإحداثيات", value: coordinates },
    { label: "رابط صورة الملعب", value: pitch.imageUrl },
    { label: "عدد الملاعب الفرعية", value: pitch.subPitchCount },
    { label: "تفاصيل الملاعب الفرعية", value: fieldDetails },
    { label: "السعر صباحاً", value: pitch.morningPrice == null ? null : formatEgp(pitch.morningPrice) },
    { label: "السعر مساءً", value: pitch.eveningPrice == null ? null : formatEgp(pitch.eveningPrice) },
    { label: "اسم الكابتن الرئيسي", value: pitch.captainName },
    { label: "هاتف الكابتن الرئيسي", value: pitch.captainPhone },
    { label: "طريقة الدفع", value: paymentMode },
    { label: "رقم Vodafone Cash", value: pitch.vodafoneCashNumber },
    { label: "مبلغ العربون", value: pitch.bookingPaymentMode === "deposit" && pitch.depositAmount != null ? formatEgp(pitch.depositAmount) : null },
    { label: "المرافق والمزايا", value: amenities },
    { label: "رقم حساب صاحب الملعب", value: owner.id },
    { label: "اسم صاحب الملعب", value: owner.name },
    { label: "بريد صاحب الملعب", value: owner.email },
    { label: "هاتف صاحب الملعب", value: owner.phone },
    { label: "تاريخ إرسال الطلب", value: formatCairoDateTime(input.submittedAt) },
  ];

  return renderEmail({
    subject: `${input.updated ? "تحديث بيانات ملعب" : "طلب مراجعة ملعب"}: ${pitch.name}`,
    preheader: `بيانات ملعب ${pitch.name} كاملة جاهزة لمراجعة الإدارة.`,
    heading: input.updated ? "تم تحديث بيانات ملعب للمراجعة" : "طلب ملعب جديد لمراجعة الإدارة",
    intro: `أرسل ${owner.name?.trim() || owner.email || "صاحب ملعب"} بيانات الملعب التالية. هذه نسخة كاملة من البيانات المحفوظة، بما فيها بيانات الاتصال والموقع والأسعار والملاعب الفرعية.`,
    recipientName: "فريق الإدارة",
    rows,
    button: { label: "فتح لوحة مراجعة الملاعب", href: appUrl("/admin-dashboard/") },
  });
}
