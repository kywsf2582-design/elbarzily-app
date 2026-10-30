import nodemailer from "nodemailer";
import type { RenderedEmail } from "./layout";

type SmtpConfig = { host: string; port: number; user: string; password: string; fromAddress: string };

function requireSmtpConfig(): SmtpConfig {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT);
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD;
  const rawFrom = process.env.SMTP_FROM?.trim();
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !user || !password || !rawFrom) {
    throw new Error("إعدادات SMTP غير مكتملة.");
  }
  const fromAddress = rawFrom.match(/<\s*([^<>]+)\s*>/)?.[1]?.trim() ?? rawFrom;
  if (!/^[^\s<>@]+@[^\s<>@]+$/.test(fromAddress)) throw new Error("عنوان SMTP_FROM غير صالح.");
  return { host, port, user, password, fromAddress };
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

export async function sendRenderedEmail(toInput: string, mail: RenderedEmail): Promise<void> {
  const to = toInput.trim();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return;
  const config = requireSmtpConfig();
  const transport = createTransport(config);
  try {
    await transport.sendMail({
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
    transport.close();
  }
}

export async function verifySmtpConnection(): Promise<void> {
  const config = requireSmtpConfig();
  const transport = createTransport(config);
  try {
    await transport.verify();
  } catch {
    throw new Error("تعذر التحقق من اتصال SMTP؛ راجع إعدادات المرسل.");
  } finally {
    transport.close();
  }
}
