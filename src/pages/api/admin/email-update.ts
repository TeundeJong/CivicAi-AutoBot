// src/pages/api/admin/email-update.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res
      .status(405)
      .json({ error: "Method not allowed, use POST" });
  }

  try {
    const { id, subject, body, status } = req.body || {};

    if (!id) {
      return res.status(400).json({ error: "Missing id" });
    }

    const update: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (typeof subject === "string") update.subject = subject;
    if (typeof body === "string") update.body = body;
    if (typeof status === "string") update.status = status;

    const { data, error } = await supabaseAdmin
      .from("email_outbox")
      .update(update)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      console.error("email-update DB error:", error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ email: data });
  } catch (err: any) {
    console.error("email-update fatal:", err);
    return res
      .status(500)
      .json({ error: err.message || "Server error" });
  }
}
