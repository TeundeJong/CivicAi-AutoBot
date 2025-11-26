// src/pages/api/cron-sendEmails.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { pickSenderForToday } from "../../lib/jobs";
import { sendEmail } from "../../lib/emailProvider";

const BATCH_SIZE = 10;

export const config = {
  api: { bodyParser: false },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const auth = req.headers.authorization;
  const secret = process.env.CRON_SECRET;

  if (!auth || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const senderSlot = await pickSenderForToday();
    if (!senderSlot) {
      return res.status(200).json({ sent: 0, reason: "no_capacity" });
    }

    const { account, used, limit } = senderSlot;
    const remaining = limit - used;
    const toSend = Math.max(0, Math.min(BATCH_SIZE, remaining));

    if (toSend <= 0) {
      return res.status(200).json({ sent: 0, reason: "limit_reached" });
    }

    const { data: rows, error } = await supabaseAdmin
      .from("email_outbox")
      .select("*")
      .eq("status", "approved")
      .is("sender_id", null)
      .order("created_at", { ascending: true })
      .limit(toSend);

    if (error) throw error;

    const drafts = rows || [];
    let sentCount = 0;

    for (const draft of drafts) {
      try {
        await sendEmail({
          to: draft.to_email,
          subject: draft.subject,
          body: draft.body,
          fromEmail: account.email,
          displayName: account.display_name || "Teun from CivicAi",
          smtpOverride: {
            host: account.smtp_host || undefined,
            port: account.smtp_port || undefined,
            user: account.smtp_user || undefined,
            pass: account.smtp_pass || undefined,
          },
        });

        await supabaseAdmin
          .from("email_outbox")
          .update({
            status: "sent",
            sender_id: account.id,
            sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", draft.id);

        sentCount++;
      } catch (err: any) {
        console.error("sendEmails error", err);
        await supabaseAdmin
          .from("email_outbox")
          .update({
            status: "failed",
            error: err.message || String(err),
            sender_id: account.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", draft.id);
      }
    }

    return res.status(200).json({
      sent: sentCount,
      from: account.email,
      remaining: remaining - sentCount,
    });
  } catch (err: any) {
    console.error("cron-sendEmails fatal", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
