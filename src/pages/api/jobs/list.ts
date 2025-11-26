// src/pages/api/jobs/list.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") return res.status(405).end();

  try {
    const { data, error } = await supabaseAdmin
      .from("marketing_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    return res.status(200).json({ jobs: data || [] });
  } catch (err: any) {
    console.error("jobs/list error", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
