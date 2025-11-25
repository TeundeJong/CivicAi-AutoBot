import nodemailer from "nodemailer";

const defaultHost = process.env.SMTP_HOST;
const defaultPort = Number(process.env.SMTP_PORT || 587);
const defaultUser = process.env.SMTP_USER;
const defaultPass = process.env.SMTP_PASS;

if (!defaultHost || !defaultUser || !defaultPass) {
  console.warn("⚠️ Default SMTP env vars not fully set. Fallback sending may fail.");
}

type SmtpConfig = {
  host?: string;
  port?: number;
  user?: string;
  pass?: string;
};

export async function sendEmail(
  to: string,
  subject: string,
  body: string,
  fromEmail: string,
  displayName?: string,
  smtpOverride?: SmtpConfig
) {
  const host = smtpOverride?.host || defaultHost;
  const port = smtpOverride?.port || defaultPort;
  const user = smtpOverride?.user || defaultUser;
  const pass = smtpOverride?.pass || defaultPass;

  if (!host || !user || !pass) {
    throw new Error("SMTP env vars not configured (no host/user/pass available)");
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  const from = displayName ? `${displayName} <${fromEmail}>` : fromEmail;

  const info = await transporter.sendMail({
    from,
    to,
    subject,
    html: body,
  });

  return info.messageId;
}
