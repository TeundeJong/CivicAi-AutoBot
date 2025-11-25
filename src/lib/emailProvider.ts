import nodemailer from "nodemailer";

const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT || 587);
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;

if (!host || !user || !pass) {
  console.warn("⚠️ SMTP env vars not fully set. Email sending will fail.");
}

const transporter = nodemailer.createTransport({
  host,
  port,
  secure: port === 465,
  auth: { user, pass },
});

export async function sendEmail(
  to: string,
  subject: string,
  body: string,
  fromEmail: string,
  displayName?: string
) {
  if (!host || !user || !pass) {
    throw new Error("SMTP env vars not configured");
  }

  const from = displayName ? `${displayName} <${fromEmail}>` : fromEmail;

  const info = await transporter.sendMail({
    from,
    to,
    subject,
    html: body,
  });

  return info.messageId;
}
