import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { processJob } from "../../lib/processors";

const BATCH_SIZE = 10;

export const config = {
  api: { bodyParser: false },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // ✨ Simpele query: pak ALLE pending jobs, oud → nieuw
    const { data: jobs, error } = await supabaseAdmin
      .from("marketing_jobs")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (error) {
      console.error("Error loading jobs", error);
      return res.status(500).json({ error: error.message });
    }

    if (!jobs || jobs.length === 0) {
      return res.status(200).json({ processed: 0 });
    }

    let processed = 0;

    for (const job of jobs) {
      try {
        // markeer als processing + attempts ophogen
        await supabaseAdmin
          .from("marketing_jobs")
          .update({
            status: "processing",
            attempts: (job.attempts ?? 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);

        // echte werk (maakt bv. email_outbox record)
        await processJob(job);

        // klaar
        await supabaseAdmin
          .from("marketing_jobs")
          .update({
            status: "done",
            last_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);

        processed++;
      } catch (e: any) {
        console.error("Error processing job", job.id, e);

        const nextAttempts = (job.attempts ?? 0) + 1;

        await supabaseAdmin
          .from("marketing_jobs")
          .update({
            status: nextAttempts >= 3 ? "failed" : "pending",
            attempts: nextAttempts,
            last_error: e?.message ?? String(e),
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);
      }
    }

    return res.status(200).json({ processed });
  } catch (e: any) {
    console.error(e);
    return res
      .status(500)
      .json({ error: e?.message ?? "Unknown error" });
  }
}
