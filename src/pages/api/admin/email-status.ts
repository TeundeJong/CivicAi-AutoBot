import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

const ALLOWED = ["draft", "approved", "scheduled", "sent", "failed"] as const;
type Status = (typeof ALLOWED)[number];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { id, status } = req.body as { id?: string; status?: Status };

    if (!id || !status || !ALLOWED.includes(status)) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    const { error } = await supabaseAdmin
      .from("email_outbox")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) throw error;

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e?.message ?? "Unknown error" });
  }
}
