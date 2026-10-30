export type EmailRow = {
  label: string;
  value: string | number | null | undefined;
};

export type EmailButton = { label: string; href: string };

export type EmailModel = {
  subject: string;
  preheader: string;
  heading: string;
  intro: string;
  recipientName?: string | null;
  rows?: EmailRow[];
  highlight?: { label: string; value: string };
  notice?: string | null;
  button?: EmailButton;
};

export type RenderedEmail = { subject: string; html: string; text: string };

const DEFAULT_APP_ORIGIN = "https://elbarzily-espcslqj.manus.space";
const LOGO_URL = "https://files.manuscdn.com/user_upload_by_module/session_file/310519664041039106/xtAQHqBwFtZYEmaI.png";
const BRAND_GREEN = "#c7f36d";
const TIME_ZONE = "Africa/Cairo";

export function appUrl(path: string): string {
  const origin = getAppOrigin();
  if (!origin) return "";
  if (!path.startsWith("/") || path.startsWith("//")) return `${origin}/`;
  try {
    const url = new URL(path, origin);
    return url.origin === origin ? url.toString() : `${origin}/`;
  } catch {
    return `${origin}/`;
  }
}

function getAppOrigin(): string | null {
  const configured = process.env.APP_PUBLIC_URL?.trim();
  if (!configured) return DEFAULT_APP_ORIGIN;
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

export function cleanText(value: string | null | undefined, fallback = "غير متاح"): string {
  const result = value?.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return result || fallback;
}

export function formatCairoDate(value: Date | string | null | undefined): string {
  const date = value instanceof Date ? value : new Date(value ?? "");
  if (Number.isNaN(date.getTime())) return "غير متاح";
  return new Intl.DateTimeFormat("ar-EG", {
    timeZone: TIME_ZONE,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export function formatCairoTime(value: Date | string | null | undefined): string {
  const date = value instanceof Date ? value : new Date(value ?? "");
  if (Number.isNaN(date.getTime())) return "غير متاح";
  return new Intl.DateTimeFormat("ar-EG", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function formatCairoDateTime(value: Date | string | null | undefined): string {
  const date = value instanceof Date ? value : new Date(value ?? "");
  if (Number.isNaN(date.getTime())) return "غير متاح";
  return `${formatCairoDate(date)}، ${formatCairoTime(date)}`;
}

export function formatEgp(value: string | number | null | undefined): string {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return "غير متاح";
  return `${new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 2 }).format(amount)} ج.م`;
}

export function formatRemainingTime(startsAt: Date | string, now = new Date()): string {
  const start = startsAt instanceof Date ? startsAt : new Date(startsAt);
  if (Number.isNaN(start.getTime())) return "موعدك قريباً";
  const totalMinutes = Math.max(0, Math.ceil((start.getTime() - now.getTime()) / 60_000));
  if (totalMinutes === 0) return "موعدك على وشك البدء";
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} يوم`);
  if (hours) parts.push(`${hours} ساعة`);
  if (minutes && days === 0) parts.push(`${minutes} دقيقة`);
  return parts.join(" و") || "أقل من دقيقة";
}

function safeButtonHref(href: string): string | null {
  try {
    const url = new URL(href);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function renderEmail(model: EmailModel): RenderedEmail {
  const recipient = cleanText(model.recipientName, "صديق البرازيلي");
  const rows = (model.rows ?? []).filter(row => row.value !== null && row.value !== undefined && String(row.value).trim() !== "");
  const safeRows = rows.map(row => ({ label: cleanText(row.label), value: cleanText(String(row.value)) }));
  const safeHref = model.button ? safeButtonHref(model.button.href) : null;
  const appOrigin = getAppOrigin();
  const appLink = appOrigin
    ? `<a href="${escapeHtml(`${appOrigin}/`)}" style="color:${BRAND_GREEN};text-decoration:none">${escapeHtml(new URL(appOrigin).host)}</a>`
    : "";
  const htmlRows = safeRows.map(row => `
    <tr>
      <td align="right" style="padding:11px 12px;border-bottom:1px solid #263247;color:#aeb9ca;font-size:14px;line-height:1.7;vertical-align:top;white-space:nowrap">${escapeHtml(row.label)}</td>
      <td align="right" dir="auto" style="padding:11px 12px;border-bottom:1px solid #263247;color:#f4f7fb;font-size:14px;font-weight:700;line-height:1.7;vertical-align:top">${escapeHtml(row.value)}</td>
    </tr>`).join("");
  const htmlHighlight = model.highlight ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 8px;background:#111d2d;border:1px solid #31425a;border-right:4px solid ${BRAND_GREEN};border-radius:12px">
      <tr><td align="center" style="padding:18px 12px 6px;color:#bfcaD8;font-size:13px">${escapeHtml(model.highlight.label)}</td></tr>
      <tr><td align="center" dir="ltr" style="padding:2px 12px 19px;color:${BRAND_GREEN};font-family:Arial,Tahoma,sans-serif;font-size:${model.highlight.value.length > 12 ? "24px" : "34px"};font-weight:800;letter-spacing:5px">${escapeHtml(model.highlight.value)}</td></tr>
    </table>` : "";
  const htmlDetails = safeRows.length ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 6px;border:1px solid #263247;border-radius:12px;border-collapse:separate;border-spacing:0;background:#101827">
      ${htmlRows}
    </table>` : "";
  const htmlNotice = model.notice ? `<p style="margin:16px 0 0;padding:12px 14px;border-right:3px solid ${BRAND_GREEN};background:#111d2d;color:#d4deea;font-size:13px;line-height:1.8">${escapeHtml(model.notice)}</p>` : "";
  const htmlButton = safeHref && model.button ? `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:24px auto 8px">
      <tr><td align="center" bgcolor="${BRAND_GREEN}" style="border-radius:10px"><a href="${escapeHtml(safeHref)}" style="display:inline-block;padding:13px 25px;border:1px solid ${BRAND_GREEN};border-radius:10px;color:#10170b;font-family:Tahoma,Arial,sans-serif;font-size:15px;font-weight:800;line-height:1.4;text-decoration:none">${escapeHtml(model.button.label)}</a></td></tr>
    </table>` : "";
  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${escapeHtml(model.subject)}</title></head>
<body dir="rtl" style="margin:0;padding:0;background:#080d16;color:#f4f7fb;font-family:Tahoma,Arial,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all">${escapeHtml(model.preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#080d16" style="width:100%;background:#080d16;border-collapse:collapse">
  <tr><td align="center" style="padding:22px 12px 28px">
    <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;border:1px solid #263247;border-radius:18px;overflow:hidden;background:#0d1421">
      <tr><td align="center" style="padding:23px 20px 17px;background:#111b2a;border-bottom:1px solid #263247">
        <img src="${LOGO_URL}" width="54" height="54" alt="شعار البرازيلي" style="display:block;width:54px;height:54px;border:0;border-radius:14px;object-fit:cover;margin:0 auto 8px">
        <div style="color:#f4f7fb;font-size:19px;font-weight:800;line-height:1.5">تطبيق البرازيلي ⚽</div>
        <div style="width:46px;height:3px;margin:11px auto 0;background:${BRAND_GREEN};border-radius:3px"></div>
      </td></tr>
      <tr><td style="padding:25px 22px 23px">
        <p style="margin:0 0 7px;color:#bac6d7;font-size:14px;line-height:1.8">مرحباً ${escapeHtml(recipient)}،</p>
        <h1 style="margin:0;color:#f7f9fc;font-size:23px;font-weight:800;line-height:1.55">${escapeHtml(model.heading)}</h1>
        <p style="margin:9px 0 0;color:#c0cada;font-size:15px;line-height:1.9">${escapeHtml(model.intro)}</p>
        ${htmlHighlight}${htmlDetails}${htmlNotice}${htmlButton}
      </td></tr>
      <tr><td align="center" style="padding:17px 18px 19px;border-top:1px solid #263247;background:#0a111c;color:#a7b2c2;font-size:12px;line-height:1.8">
        <div style="color:#dce4ee;font-weight:700">البرازيلي — ملعبك، فريقك، ماتشك ⚽</div>
        ${appLink}
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
  const textLines = [
    "تطبيق البرازيلي ⚽",
    model.heading,
    "",
    `مرحباً ${recipient}،`,
    model.intro,
    ...(model.highlight ? ["", `${model.highlight.label}: ${model.highlight.value}`] : []),
    ...(safeRows.length ? ["", ...safeRows.map(row => `${row.label}: ${row.value}`)] : []),
    ...(model.notice ? ["", model.notice] : []),
    ...(safeHref && model.button ? ["", `${model.button.label}: ${safeHref}`] : []),
    "",
    "البرازيلي — ملعبك، فريقك، ماتشك ⚽",
    ...(appOrigin ? [`${appOrigin}/`] : []),
  ];
  return { subject: model.subject, html, text: textLines.join("\n") };
}
