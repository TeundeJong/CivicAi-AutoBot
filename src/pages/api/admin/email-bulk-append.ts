// src/pages/api/admin/email-bulk-append.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

/**
 * Append text to the body of many emails (by id).
 * Does NOT touch subject, lead parsing, or any other logic.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { ids, appendText } = req.body || {};

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "No ids provided" });
    }
    if (typeof appendText !== "string" || appendText.trim().length === 0) {
      return res.status(400).json({ error: "appendText is required" });
    }

    const text = appendText.trim();

    // Fetch current bodies
    const { data, error } = await supabaseAdmin
      .from("email_outbox")
      .select("id, body")
      .in("id", ids)
      .limit(5000);

    if (error) throw error;

    const rows = (data || []) as { id: string; body: string | null }[];
    if (!rows.length) {
      return res.status(200).json({ updated: 0 });
    }

    // Update per row (safe + simple)
    await Promise.all(
      rows.map(async (r) => {
        const current = (r.body || "").trim();
        const next = current.length > 0 ? `${current}\n\n${text}` : text;

        const { error: updErr } = await supabaseAdmin
          .from("email_outbox")
          .update({ body: next, updated_at: new Date().toISOString() })
          .eq("id", r.id);

        if (updErr) throw updErr;
      })
    );

    return res.status(200).json({ updated: rows.length });
  } catch (err: any) {
    console.error("admin/email-bulk-append error", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
