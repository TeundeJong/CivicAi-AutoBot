// src/pages/api/admin/email-bulk-status.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

type EmailStatus =
  | "draft"
  | "approved"
  | "sent"
  | "failed"
  | "declined"
  | "archived";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { ids, status } = req.body || {};
    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ error: "No ids provided" });
    }
    if (!status) {
      return res.status(400).json({ error: "No status provided" });
    }

    const allowed: EmailStatus[] = [
      "draft",
      "approved",
      "sent",
      "failed",
      "declined",
      "archived",
    ];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const { error } = await supabaseAdmin
      .from("email_outbox")
      .update({ status, updated_at: new Date().toISOString() })
      .in("id", ids);

    if (error) throw error;

    return res.status(200).json({ updated: ids.length });
  } catch (err: any) {
    console.error("admin/email-bulk-status error", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
