// src/pages/api/admin/email-send-now.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { sendSingleOutboxEmailNow } from "../../../lib/sendOutboxBatch";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { id } = req.body || {};
    if (!id) {
      return res.status(400).json({ error: "Missing id" });
    }

    const result = await sendSingleOutboxEmailNow(id);
    return res.status(200).json(result);
  } catch (err: any) {
    console.error("admin/email-send-now error", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
