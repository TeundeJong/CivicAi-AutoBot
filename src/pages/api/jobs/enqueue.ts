import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { JobType, MarketingJobPayload } from "../../../lib/jobs";

type Body = {
  type: JobType;
  leadId?: string;
  payload: MarketingJobPayload;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const body = req.body as Body;

    if (!body.type || !body.payload) {
      return res.status(400).json({ error: "Missing type or payload" });
    }

    const { data, error } = await supabaseAdmin
      .from("marketing_jobs")
      .insert({
        type: body.type,
        lead_id: body.leadId ?? null,
        payload: body.payload,
        status: "pending",
      })
      .select("*")
      .single();

    if (error) throw error;

    return res.status(200).json({ job: data });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e?.message ?? "Unknown error" });
  }
}
