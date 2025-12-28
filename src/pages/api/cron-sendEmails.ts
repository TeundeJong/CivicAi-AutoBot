// src/pages/api/cron-sendEmails.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin, SenderAccount } from "../../lib/supabaseAdmin";
import { sendEmail } from "../../lib/emailProvider";

export const config = {
  api: { bodyParser: false },
};

// hoeveel e-mails maximaal per account per cron-run
const PER_RUN_PER_ACCOUNT = 5;

// zelfde warmup-logica als in jobs.ts
function calcWarmupLimit(account: SenderAccount, today = new Date()): number {
  const max = account.max_per_day || 50;
  if (!account.warmup_start_date) return max;

  const start = new Date(account.warmup_start_date);
  const diffDays = Math.floor(
    (today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays <= 0) return 5;
  if (diffDays === 1) return 10;
  if (diffDays === 2) return 20;
  if (diffDays === 3) return 30;
  if (diffDays === 4) return 40;
  if (diffDays === 5) return max;
  return max;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // zelfde auth als je oude versie
  const auth = req.headers.authorization;
  const secret = process.env.CRON_SECRET;

  if (!auth || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // --- NIEUW: global sending toggle check ---
    let sendingEnabled = true;
    try {
      const { data: settingsRows, error: settingsErr } = await supabaseAdmin
        .from("autobot_settings")
        .select("sending_enabled")
        .eq("id", 1)
        .limit(1);

      if (settingsErr) {
        console.warn(
          "autobot_settings read error, defaulting to enabled",
          settingsErr
        );
      } else if (settingsRows && settingsRows.length > 0) {
        sendingEnabled = !!settingsRows[0].sending_enabled;
      }
    } catch (e) {
      console.warn(
        "autobot_settings check failed, defaulting to enabled",
        e
      );
    }

 if (!sendingEnabled) {
    return res.status(200).json({ sent: 0, reason: "sending_paused" });
  }

  const now = new Date();
  // Optioneel sending window via env vars (HH in 0-23). Als niet gezet: 24/7 versturen.
  const winStartRaw = process.env.SENDING_WINDOW_START_HOUR;
  const winEndRaw = process.env.SENDING_WINDOW_END_HOUR;
  if (winStartRaw != null && winEndRaw != null) {
    const winStart = Number(winStartRaw);
    const winEnd = Number(winEndRaw);
    if (Number.isFinite(winStart) && Number.isFinite(winEnd)) {
      const hour = now.getHours();
      // zelfde semantics als eerder: start inclusief, end exclusief
      if (hour < winStart || hour >= winEnd) {
        return res.status(200).json({
          sent: 0,
          reason: "outside_sending_window",
          window: { startHour: winStart, endHour: winEnd },
        });
      }
    }
  }
  // 1) Active sender accounts ophalen
  const { data: accounts, error: accErr } = await supabaseAdmin
    .from("sender_accounts")
    .select("*")
    .eq("is_active", true);

    if (accErr) throw accErr;

    const senderList = (accounts || []) as SenderAccount[];

    if (!senderList.length) {
      return res
        .status(200)
        .json({ sent: 0, reason: "no_active_sender_accounts" });
    }

    // Warmup start automatisch zetten op het moment dat je echt gaat versturen.
    // (Alleen voor accounts waar warmup_start_date nog leeg is.)
    const accountsMissingWarmup = senderList.filter(
      (a) => !a.warmup_start_date
    );
    if (accountsMissingWarmup.length > 0) {
      const { count: approvedCount, error: approvedCountErr } =
        await supabaseAdmin
          .from("email_outbox")
          .select("*", { count: "exact", head: true })
          .eq("status", "approved")
          .is("sender_id", null);

      if (approvedCountErr) throw approvedCountErr;

      if ((approvedCount || 0) > 0) {
        const warmupStartIso = now.toISOString();
        const ids = accountsMissingWarmup.map((a) => a.id);

        const { error: warmupSetErr } = await supabaseAdmin
          .from("sender_accounts")
          .update({ warmup_start_date: warmupStartIso })
          .in("id", ids)
          .is("warmup_start_date", null);

        if (warmupSetErr) throw warmupSetErr;

        // update local copies so calcWarmupLimit uses the fresh date in this run
        for (const a of senderList) {
          if (!a.warmup_start_date && ids.includes(a.id)) {
            a.warmup_start_date = warmupStartIso;
          }
        }
      }
    }

    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
    const startOfDayIso = startOfDay.toISOString();

    // 2) Bereken per account: daily limit, al verstuurd, resterend, capacity voor deze run
    type Slot = {
      account: SenderAccount;
      dailyLimit: number;
      usedToday: number;
      remainingToday: number;
      capacityThisRun: number;
    };

    const slots: Slot[] = [];

    for (const acc of senderList) {
      const dailyLimit = calcWarmupLimit(acc, now);

      const { count, error: cntErr } = await supabaseAdmin
        .from("email_outbox")
        .select("*", { count: "exact", head: true })
        .eq("sender_id", acc.id)
        .eq("status", "sent")
        .gte("sent_at", startOfDayIso);

      if (cntErr) throw cntErr;

      const usedToday = count || 0;
      const remainingToday = Math.max(0, dailyLimit - usedToday);

      const capacityThisRun = Math.min(
        remainingToday,
        PER_RUN_PER_ACCOUNT
      );

      if (capacityThisRun > 0) {
        slots.push({
          account: acc,
          dailyLimit,
          usedToday,
          remainingToday,
          capacityThisRun,
        });
      }
    }

    if (!slots.length) {
      return res
        .status(200)
        .json({ sent: 0, reason: "no_capacity_for_any_account" });
    }

    const totalToSend = slots.reduce(
      (sum, s) => sum + s.capacityThisRun,
      0
    );

    if (totalToSend <= 0) {
      return res
        .status(200)
        .json({ sent: 0, reason: "total_capacity_zero" });
    }

    // 3) Queue ophalen: approved + nog geen sender_id
    const { data: queue, error: queueErr } = await supabaseAdmin
      .from("email_outbox")
      .select("*")
      .eq("status", "approved")
      .is("sender_id", null)
      .order("created_at", { ascending: true })
      .limit(totalToSend);

    if (queueErr) throw queueErr;

    const drafts = queue || [];
    if (!drafts.length) {
      return res
        .status(200)
        .json({ sent: 0, reason: "no_approved_emails" });
    }

    // 4) Mails verdelen over accounts
    let cursor = 0;
    let sentGlobal = 0;

    for (const slot of slots) {
      const slice = drafts.slice(cursor, cursor + slot.capacityThisRun);
      if (!slice.length) break;
      cursor += slice.length;

      for (const draft of slice) {
        try {
          await sendEmail({
            to: draft.to_email,
            subject: draft.subject,
            body: draft.body,
            fromEmail: slot.account.email,
            displayName: slot.account.display_name || "Teun – CivicAi Solutions",
            smtpOverride: {
              host: slot.account.smtp_host || undefined,
              port: slot.account.smtp_port || undefined,
              user: slot.account.smtp_user || undefined,
              pass: slot.account.smtp_pass || undefined,
            },
          });

          await supabaseAdmin
            .from("email_outbox")
            .update({
              status: "sent",
              sender_id: slot.account.id,
              sent_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", draft.id);

          sentGlobal++;
        } catch (err: any) {
          console.error("cron-sendEmails send error", err);
          await supabaseAdmin
            .from("email_outbox")
            .update({
              status: "failed",
              error: err?.message || String(err),
              sender_id: slot.account.id,
              updated_at: new Date().toISOString(),
            })
            .eq("id", draft.id);
        }
      }
    }

    return res.status(200).json({
      sent: sentGlobal,
      totalQueuedFetched: drafts.length,
      accountsUsed: slots.map((s) => ({
        email: s.account.email,
        capacityThisRun: s.capacityThisRun,
        remainingTodayBefore: s.remainingToday,
        dailyLimit: s.dailyLimit,
      })),
    });
  } catch (err: any) {
    console.error("cron-sendEmails fatal", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
}
