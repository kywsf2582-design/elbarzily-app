import nodemailer from "nodemailer";
import type { RenderedEmail } from "./layout";

type SmtpConfig = { host: string; port: number; user: string; password: string; fromAddress: string };
const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";
const BREVO_TIMEOUT_MS = 15_000;

function parseFromAddress(rawInput: string | undefined): string {
  const raw = rawInput?.trim();
  if (!raw) throw new Error("إعداد عنوان مرسل البريد غير مكتمل.");
  const address = raw.match(/<\s*([^<>]+)\s*>/)?.[1]?.trim() ?? raw;
  if (!/^[^\s<>@]+@[^\s<>@]+$/.test(address)) throw new Error("عنوان مرسل البريد غير صالح.");
  return address;
}

function requireSmtpConfig(): SmtpConfig {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT);
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD;
  const rawFrom = process.env.SMTP_FROM?.trim();
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !user || !password || !rawFrom) {
    throw new Error("إعدادات SMTP غير مكتملة.");
  }
  return { host, port, user, password, fromAddress: parseFromAddress(rawFrom) };
}

function createTransport(config: SmtpConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    requireTLS: config.port === 587,
    auth: { user: config.user, pass: config.password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    tls: { minVersion: "TLSv1.2" },
  });
}

async function sendWithBrevoApi(to: string, mail: RenderedEmail): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  if (!apiKey) throw new Error("إعداد مفتاح Brevo API غير مكتمل.");

  const fromAddress = parseFromAddress(process.env.BREVO_FROM ?? process.env.SMTP_FROM);
  const response = await fetch(BREVO_SEND_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: { name: process.env.BREVO_SENDER_NAME?.trim() || "تطبيق البرازيلي", email: fromAddress },
      to: [{ email: to }],
      subject: mail.subject,
      htmlContent: mail.html,
      textContent: mail.text,
      headers: { "X-Auto-Response-Suppress": "All" },
    }),
    signal: AbortSignal.timeout(BREVO_TIMEOUT_MS),
  });

  if (!response.ok) {
    // Avoid logging the provider response body or any credential-related details.
    console.error(`[mail] Brevo API returned HTTP ${response.status}`);
    throw new Error("تعذر إرسال البريد عبر Brevo API.");
  }
}

export async function sendRenderedEmail(toInput: string, mail: RenderedEmail): Promise<void> {
  const to = toInput.trim();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return;

  const transport = process.env.MAIL_TRANSPORT?.trim().toLowerCase();
  if (transport === "brevo-api" || process.env.BREVO_API_KEY?.trim()) {
    await sendWithBrevoApi(to, mail);
    return;
  }

  const config = requireSmtpConfig();
  const smtp = createTransport(config);
  try {
    await smtp.sendMail({
      from: { name: "تطبيق البرازيلي ⚽", address: config.fromAddress },
      to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      headers: { "X-Auto-Response-Suppress": "All" },
    });
  } catch {
    throw new Error("تعذر إرسال البريد عبر SMTP.");
  } finally {
    smtp.close();
  }
}

export async function verifySmtpConnection(): Promise<void> {
  const config = requireSmtpConfig();
  const smtp = createTransport(config);
  try {
    await smtp.verify();
  } catch {
    throw new Error("تعذر التحقق من اتصال SMTP؛ راجع إعدادات المرسل.");
  } finally {
    smtp.close();
  }
}
