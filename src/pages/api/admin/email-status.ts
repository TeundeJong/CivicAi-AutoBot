// src/pages/api/admin/email-status.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const { id, status } = req.body;

    if (!id || !status) {
      return res.status(400).json({ error: "id en status verplicht" });
    }

    if (!["draft", "approved", "declined", "archived"].includes(status)) {
      return res.status(400).json({ error: "Ongeldige status" });
    }

    const { error } = await supabaseAdmin
      .from("email_outbox")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) throw error;

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("email-status error", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
