// src/pages/api/admin/bulk-leads.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

interface ParsedRow {
  name?: string | null;
  company?: string | null;
  email: string;
}

function parseLines(raw: string): ParsedRow[] {
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      // Formaat: "Naam, Company, email" of alleen "email"
      const parts = line.split(",").map((p) => p.trim());
      const email = parts[parts.length - 1];

      if (!email.includes("@")) return null;

      const name = parts.length >= 2 ? parts[0] : null;
      const company = parts.length >= 3 ? parts[1] : null;

      return { email, name, company } as ParsedRow;
    })
    .filter((x): x is ParsedRow => !!x);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { lines, makeJobs } = req.body as {
    lines?: string;
    makeJobs?: boolean;
  };

  if (!lines) {
    return res.status(400).json({ error: "Missing lines" });
  }

  const rows = parseLines(lines);
  if (!rows.length) {
    return res.status(400).json({ error: "No valid leads in input" });
  }

  // 1) Leads aanmaken
  const { data: insertedLeads, error: leadsError } = await supabaseAdmin
    .from("leads")
    .insert(
      rows.map((r) => ({
        email: r.email,
        name: r.name,
        company: r.company,
      }))
    )
    .select("id");

  if (leadsError || !insertedLeads) {
    return res.status(500).json({ error: leadsError?.message || "Insert leads failed" });
  }

  let jobsCreated = 0;

  // 2) Direct jobs aanmaken (e-mail + DM) als makeJobs = true
  if (makeJobs && insertedLeads.length > 0) {
    const jobRows = insertedLeads.flatMap((lead) => [
      {
        type: "GENERATE_EMAIL",
        status: "pending",
        lead_id: lead.id,
        payload: {
          language: "en",
          autoApprove: false,
          extraContext: "Cold outreach for ContractGuard AI.",
        },
      },
      {
        type: "GENERATE_LINKEDIN_DM",
        status: "pending",
        lead_id: lead.id,
        payload: {
          language: "en",
          autoApprove: false,
          extraContext: "Short LinkedIn DM for ContractGuard AI.",
        },
      },
    ]);

    const { error: jobsError } = await supabaseAdmin
      .from("marketing_jobs")
      .insert(jobRows);

    if (jobsError) {
      console.error(jobsError);
      return res
        .status(500)
        .json({ error: jobsError.message || "Failed to insert jobs" });
    }

    jobsCreated = jobRows.length;
  }

  return res.status(200).json({
    inserted: insertedLeads.length,
    jobsCreated,
  });
}
