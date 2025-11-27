// src/pages/api/cron-sendEmails.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { sendApprovedBatchOnce } from "../../lib/sendOutboxBatch";

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
    const limit =
      typeof req.query.limit === "string"
        ? Number(req.query.limit)
        : 10;

    const result = await sendApprovedBatchOnce(
      Number.isFinite(limit) && limit > 0 ? limit : 10
    );

    return res.status(200).json(result);
  } catch (err: any) {
    console.error("cron-sendEmails fatal", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
