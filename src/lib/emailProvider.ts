// src/lib/emailProvider.ts
import nodemailer from "nodemailer";

type SmtpConfig = {
  host?: string;
  port?: number;
  user?: string;
  pass?: string;
};

const defaultHost = process.env.SMTP_HOST;
const defaultPort = Number(process.env.SMTP_PORT || 587);
const defaultUser = process.env.SMTP_USER;
const defaultPass = process.env.SMTP_PASS;

if (!defaultHost || !defaultUser || !defaultPass) {
  console.warn("⚠️ SMTP_* env vars niet volledig. Fallback kan falen.");
}

export async function sendEmail(options: {
  to: string;
  subject: string;
  body: string;
  fromEmail: string;
  displayName?: string;
  smtpOverride?: SmtpConfig;
}) {
  const { to, subject, body, fromEmail, displayName, smtpOverride } = options;

  const host = smtpOverride?.host || defaultHost;
  const port = smtpOverride?.port || defaultPort;
  const user = smtpOverride?.user || defaultUser;
  const pass = smtpOverride?.pass || defaultPass;

  if (!host || !user || !pass) {
    throw new Error("SMTP config incompleet (host/user/pass).");
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
  });

  const from = displayName ? `${displayName} <${fromEmail}>` : fromEmail;

  const info = await transporter.sendMail({
    from,
    to,
    subject,
    text: body,
  });

  return info;
}
