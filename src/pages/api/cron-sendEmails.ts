import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { sendEmail } from "../../lib/emailProvider";

const BATCH_SIZE = 100;

export const config = {
  api: { bodyParser: false },
};

function startOfTodayUTC() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function getWarmupLimit(daysActive: number): number {
  if (daysActive <= 0) return 5;
  if (daysActive === 1) return 8;
  if (daysActive === 2) return 12;
  if (daysActive === 3) return 20;
  if (daysActive === 4) return 30;
  return 50;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const todayStart = startOfTodayUTC();

    const { data: senders, error: senderError } = await supabaseAdmin
      .from("sender_accounts")
      .select("*")
      .eq("is_active", true);

    if (senderError) throw senderError;
    if (!senders || senders.length === 0) {
      return res.status(200).json({ message: "No active sender accounts", sent: 0 });
    }

    const senderQuotas: {
      [id: string]: { email: string; display_name: string | null; remaining: number };
    } = {};

    for (const s of senders) {
      const warmupStart = s.warmup_start_date
        ? new Date(s.warmup_start_date)
        : todayStart;
      const daysActive = Math.floor(
        (todayStart.getTime() - warmupStart.getTime()) / (1000 * 60 * 60 * 24)
      );
      const limit = getWarmupLimit(daysActive);

      const { count, error: countError } = await supabaseAdmin
        .from("email_outbox")
        .select("id", { count: "exact", head: true })
        .eq("from_email", s.email)
        .eq("status", "sent")
        .gte("sent_at", todayStart.toISOString());

      if (countError) throw countError;

      const alreadySent = count ?? 0;
      const remaining = Math.max(limit - alreadySent, 0);

      senderQuotas[s.id] = {
        email: s.email,
        display_name: s.display_name,
        remaining,
      };
    }

    const totalRemaining = Object.values(senderQuotas).reduce(
      (sum, s) => sum + s.remaining,
      0
    );

    if (totalRemaining <= 0) {
      return res.status(200).json({ message: "All senders at warmup limit", sent: 0 });
    }

    const { data: toSend, error } = await supabaseAdmin
      .from("email_outbox")
      .select("*")
      .in("status", ["approved", "scheduled"])
      .order("created_at", { ascending: true })
      .limit(Math.min(BATCH_SIZE, totalRemaining));

    if (error) throw error;
    if (!toSend || toSend.length === 0) {
      return res.status(200).json({ message: "No emails to send", sent: 0 });
    }

    const senderIds = Object.keys(senderQuotas).filter(
      (id) => senderQuotas[id].remaining > 0
    );
    if (senderIds.length === 0) {
      return res.status(200).json({ message: "No remaining quota", sent: 0 });
    }

    let sent = 0;
    let senderIndex = 0;

    for (const mail of toSend) {
      let attempts = 0;
      let senderId = senderIds[senderIndex];
      while (senderQuotas[senderId].remaining <= 0 && attempts < senderIds.length) {
        senderIndex = (senderIndex + 1) % senderIds.length;
        senderId = senderIds[senderIndex];
        attempts++;
      }
      const sender = senderQuotas[senderId];
      if (!sender || sender.remaining <= 0) break;

      try {
        await sendEmail(
          mail.to_email,
          mail.subject,
          mail.body,
          sender.email,
          sender.display_name || undefined
        );

        await supabaseAdmin
          .from("email_outbox")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            error: null,
            from_email: sender.email,
            sender_id: senderId,
          })
          .eq("id", mail.id);

        sender.remaining -= 1;
        sent++;
        senderIndex = (senderIndex + 1) % senderIds.length;
      } catch (e: any) {
        await supabaseAdmin
          .from("email_outbox")
          .update({
            status: "failed",
            error: e?.message ?? String(e),
            updated_at: new Date().toISOString(),
          })
          .eq("id", mail.id);
      }
    }

    return res.status(200).json({ sent });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e?.message ?? "Unknown error" });
  }
}
