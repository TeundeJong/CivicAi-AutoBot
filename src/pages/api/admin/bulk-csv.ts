// src/pages/api/admin/bulk-csv.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { enqueueJob } from "../../../lib/jobs";

type RowInput = {
  email?: string | null;
  name?: string | null;
  company?: string | null;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { rows, makeJobs } = (req.body || {}) as {
      rows?: RowInput[];
      makeJobs?: boolean;
    };

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "No rows provided" });
    }

    const leadsToUpsert = rows
      .map((r) => {
        const email = r.email?.trim().toLowerCase();
        if (!email || !email.includes("@")) return null;
        return {
          email,
          name: r.name?.trim() || null,
          company: r.company?.trim() || null,
        };
      })
      .filter(Boolean) as { email: string; name: string | null; company: string | null }[];

    if (!leadsToUpsert.length) {
      return res.status(400).json({ error: "No valid emails" });
    }

    const { data: leads, error: upsertErr } = await supabaseAdmin
      .from("leads")
      .upsert(leadsToUpsert, { onConflict: "email" })
      .select("id, email, name, company");

    if (upsertErr) {
      console.error("bulk-csv upsert error:", upsertErr);
      return res.status(500).json({ error: upsertErr.message });
    }

    const insertedLeads = leads || [];
    let jobsCreated = 0;

    if (makeJobs) {
      for (const lead of insertedLeads) {
        await enqueueJob({
          type: "GENERATE_EMAIL",
          leadId: lead.id,
          payload: {
            language: "en",
            autoApprove: true,
            extraContext: "First contact for ContractGuard AI.",
          },
        });
        jobsCreated++;
      }
    }

    return res.status(200).json({
      inserted: insertedLeads.length,
      jobsCreated,
    });
  } catch (err: any) {
    console.error("bulk-csv error:", err);
    return res
      .status(500)
      .json({ error: err.message || "Unknown error" });
  }
}
