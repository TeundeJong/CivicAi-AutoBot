// src/pages/api/jobs/enqueue.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { enqueueJob } from "../../../lib/jobs";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const { type, leadId, payload } = req.body;

    if (type !== "GENERATE_EMAIL") {
      return res.status(400).json({ error: "Unsupported job type" });
    }
    if (!leadId) {
      return res.status(400).json({ error: "leadId is required" });
    }

    const job = await enqueueJob({
      type: "GENERATE_EMAIL",
      leadId,
      payload: {
        language: payload?.language || "nl",
        autoApprove: !!payload?.autoApprove,
        extraContext: payload?.extraContext || "",
      },
    });

    return res.status(200).json({ job });
  } catch (err: any) {
    console.error("enqueue error", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
