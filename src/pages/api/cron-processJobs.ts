// src/pages/api/admin/cron-processJobs.ts

import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { getPendingJobs, markJobStatus } from "../../lib/jobs";
import { generateSalesEmail } from "../../lib/openaiClient";


export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const limit = Number(req.body?.limit || 20);

    // 1) Pending jobs ophalen
    const jobs = await getPendingJobs(limit);

    let processed = 0;
    let failed = 0;

    for (const job of jobs) {
      try {
        // markeer als processing
        await markJobStatus(job.id, "processing");

        // 2) Lead erbij zoeken
        const { data: lead, error: leadErr } = await supabaseAdmin
          .from("leads")
          .select("id, email, name, company")
          .eq("id", job.lead_id)
          .single();

        if (leadErr) throw leadErr;
        if (!lead?.email) throw new Error("Lead heeft geen email");

        // 3) E-mail laten schrijven
        const payload: any = job.payload || {};
        const language: "en" | "nl" =
          (payload.language as "en" | "nl") || "en";

        const { subject, body } = await generateSalesEmail({
          language,
          leadName: lead.name,
          company: lead.company,
          extraContext: payload.extraContext,
        });

        // 4) E-mail in de outbox zetten
        const status: "draft" | "approved" =
          payload.autoApprove === true ? "approved" : "draft";

        const { error: outErr } = await supabaseAdmin
          .from("email_outbox")
          .insert({
            to_email: lead.email,
            subject,
            body,
            status,
            lead_id: lead.id,
          });

        if (outErr) throw outErr;

        // 5) Job afronden
        await markJobStatus(job.id, "done");
        processed++;
      } catch (err: any) {
        console.error("Job failed", job.id, err);
        await markJobStatus(
          job.id,
          "failed",
          err?.message || String(err || "unknown error")
        );
        failed++;
      }
    }

    return res.status(200).json({
      totalJobsFetched: jobs.length,
      processed,
      failed,
    });
  } catch (err: any) {
    console.error(err);
    return res
      .status(500)
      .json({ error: err?.message || "Failed to run jobs" });
  }
}
