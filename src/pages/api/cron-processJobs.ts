import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { processJob } from "../../lib/processors";
import { JobType } from "../../lib/jobs";

const BATCH_SIZE = 10;

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { data: jobs, error } = await supabaseAdmin
      .from("marketing_jobs")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (error) throw error;

    if (!jobs || jobs.length === 0) {
      return res.status(200).json({ processed: 0 });
    }

    let processed = 0;

    for (const job of jobs) {
      try {
        await supabaseAdmin
          .from("marketing_jobs")
          .update({
            status: "processing",
            attempts: job.attempts + 1,
          })
          .eq("id", job.id);

        await processJob({
          ...job,
          type: job.type as JobType,
        });

        await supabaseAdmin
          .from("marketing_jobs")
          .update({
            status: "done",
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);

        processed++;
      } catch (e: any) {
        await supabaseAdmin
          .from("marketing_jobs")
          .update({
            status: job.attempts + 1 >= 3 ? "failed" : "pending",
            last_error: e?.message ?? String(e),
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);
      }
    }

    return res.status(200).json({ processed });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e?.message ?? "Unknown error" });
  }
}
