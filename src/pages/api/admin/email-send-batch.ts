// src/pages/api/admin/email-send-batch.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { sendApprovedBatchOnce } from "../../../lib/sendOutboxBatch";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const limit = Number(req.body?.limit || 50); // bv. 50 max per klik
    const result = await sendApprovedBatchOnce(
      Number.isFinite(limit) && limit > 0 ? limit : 50
    );
    return res.status(200).json(result);
  } catch (err: any) {
    console.error("admin/email-send-batch error", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
