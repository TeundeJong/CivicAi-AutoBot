import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("email_outbox")
      .select(
        "id, to_email, subject, status, campaign_name, created_at, sent_at, error"
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;

    return res.status(200).json({ emails: data || [] });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e?.message ?? "Unknown error" });
  }
}
