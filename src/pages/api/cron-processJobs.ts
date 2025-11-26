// src/pages/api/cron-processJobs.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getPendingJobs, markJobStatus } from "../../lib/jobs";
import { processGenerateEmailJob } from "../../lib/processors";

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
    const jobs = await getPendingJobs(BATCH_SIZE);
    let processed = 0;

    for (const job of jobs) {
      try {
        await markJobStatus(job.id, "processing");

        if (job.type === "GENERATE_EMAIL") {
          await processGenerateEmailJob(job);
        } else {
          console.warn("Onbekend jobtype", job.type);
        }

        await markJobStatus(job.id, "done");
        processed++;
      } catch (err: any) {
        console.error("Job failed", job.id, err);
        await markJobStatus(job.id, "failed", err.message || String(err));
      }
    }

    return res.status(200).json({ processed });
  } catch (err: any) {
    console.error("cron-processJobs fatal", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
