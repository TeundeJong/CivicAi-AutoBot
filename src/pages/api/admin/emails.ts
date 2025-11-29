// src/pages/api/admin/emails.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") return res.status(405).end();

  try {
    const { status = "all" } = req.query;

    let query = supabaseAdmin
      .from("email_outbox")
      .select("*, leads(name, company), sender_accounts(email)")
      .order("created_at", { ascending: false })
      .limit(5000);

    if (status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) throw error;

    return res.status(200).json({ emails: data || [] });
  } catch (err: any) {
    console.error("admin/emails error", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
