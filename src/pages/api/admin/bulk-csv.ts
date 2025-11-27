// src/pages/api/admin/bulk-csv.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

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

    // ---- CLEAN / VALIDATE ----
    const leadsToInsert = rows
      .map((r) => {
        const email = r.email?.trim().toLowerCase();
        if (!email || !email.includes("@")) return null;

        return {
          email,
          name: r.name?.trim() || null,
          company: r.company?.trim() || null,
        };
      })
      .filter(Boolean) as {
      email: string;
      name: string | null;
      company: string | null;
    }[];

    if (!leadsToInsert.length) {
      return res.status(400).json({ error: "No valid emails" });
    }

    // ---- INSERT LEADS ----
    const { data: insertedLeads, error: leadErr } = await supabaseAdmin
      .from("leads")
      .insert(leadsToInsert)
      .select("id, email, name, company");

    if (leadErr) {
      console.error("Lead insert error:", leadErr);
      return res.status(500).json({ error: leadErr.message });
    }

    let jobsCreated = 0;

    // ---- OPTIONAL: CREATE JOBS ----
    if (makeJobs) {
      const jobs = (insertedLeads || []).map((lead) => ({
        type: "GENERATE_EMAIL",
        status: "pending", // <-- belangrijk voor marketing_jobs
        lead_id: lead.id,
        payload: {
          language: lead.email.endsWith(".nl") ? "nl" : "en",
          autoApprove: true,
          extraContext: "First contact for ContractGuard AI.",
        },
      }));

      if (jobs.length) {
        const { error: jobsErr } = await supabaseAdmin
          .from("marketing_jobs") // <-- gebruik marketing_jobs
          .insert(jobs);

        if (jobsErr) {
          console.error("Job insert error:", jobsErr);
          return res.status(500).json({ error: jobsErr.message });
        }
      }

      jobsCreated = jobs.length;
    }

    return res.status(200).json({
      inserted: leadsToInsert.length,
      jobsCreated,
    });
  } catch (err: any) {
    console.error("bulk-csv error:", err);
    return res
      .status(500)
      .json({ error: err.message || "Unknown error" });
  }
}
