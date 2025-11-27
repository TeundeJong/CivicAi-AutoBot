// src/lib/sendOutboxBatch.ts
import { supabaseAdmin } from "./supabaseAdmin";
import { pickSenderForToday } from "./jobs";
import { sendEmail } from "./emailProvider";

/**
 * Stuurt een batch approved e-mails (zonder sender_id),
 * met respect voor warmup en max_per_day.
 */
export async function sendApprovedBatchOnce(maxBatch: number = 10) {
  const senderSlot = await pickSenderForToday();
  if (!senderSlot) {
    return { sent: 0, reason: "no_capacity" as const };
  }

  const { account, used, limit } = senderSlot;
  const remaining = limit - used;
  const toSend = Math.max(0, Math.min(maxBatch, remaining));

  if (toSend <= 0) {
    return { sent: 0, reason: "limit_reached" as const };
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
      console.error("sendApprovedBatchOnce error", err);
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

  return {
    sent: sentCount,
    from: account.email,
    remaining: remaining - sentCount,
    reason: "ok" as const,
  };
}

/**
 * Stuurt één specifieke e-mail (id) nu direct,
 * met respect voor warmup/daglimiet.
 */
export async function sendSingleOutboxEmailNow(outboxId: string) {
  const senderSlot = await pickSenderForToday();
  if (!senderSlot) {
    return { sent: 0, reason: "no_capacity" as const };
  }

  const { account, used, limit } = senderSlot;
  if (used >= limit) {
    return { sent: 0, reason: "limit_reached" as const };
  }

  const { data: draft, error } = await supabaseAdmin
    .from("email_outbox")
    .select("*")
    .eq("id", outboxId)
    .single();

  if (error) throw error;
  if (!draft) throw new Error("Email not found");

  if (draft.status !== "approved") {
    throw new Error("Email must be approved before sending");
  }

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

  return {
    sent: 1,
    from: account.email,
    remaining: limit - used - 1,
    reason: "ok" as const,
  };
}
