// src/pages/api/admin/bulk-leads.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { enqueueJob } from "../../../lib/jobs";

// Helper om 1 regel te parsen:
// - "Name, Company, email@domain.com"
// - of alleen "email@domain.com"
function parseLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Als er geen komma staat: neem het hele ding als e-mail
  if (!trimmed.includes(",")) {
    if (!trimmed.includes("@")) return null;
    return { email: trimmed, name: null, company: null };
  }

  const parts = trimmed.split(",").map((p) => p.trim());
  const email = parts[parts.length - 1];
  if (!email || !email.includes("@")) return null;

  const name = parts[0] || null;
  const company = parts.length > 2 ? parts[1] || null : null;

  return { email, name, company };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { lines, makeJobs } = (req.body || {}) as {
      lines?: string;
      makeJobs?: boolean;
    };

    if (!lines || typeof lines !== "string") {
      return res.status(400).json({ error: "No lines provided" });
    }

    // 1) Regels opschonen
    const rows = lines
      .split("\n")
      .map((l) => parseLine(l))
      .filter(Boolean) as { email: string; name: string | null; company: string | null }[];

    if (!rows.length) {
      return res
        .status(400)
        .json({ error: "No valid email lines found in input" });
    }

    // 2) Leads inserten
    const { data: insertedLeads, error: leadErr } = await supabaseAdmin
      .from("leads")
      .insert(
        rows.map((r) => ({
          email: r.email.toLowerCase(),
          name: r.name,
          company: r.company,
        }))
      )
      .select("id, email, name, company");

    if (leadErr) {
      console.error("Lead insert error:", leadErr);
      return res.status(500).json({ error: leadErr.message });
    }

    let jobsCreated = 0;

    // 3) Optioneel: jobs aanmaken in marketing_jobs
    if (makeJobs && insertedLeads && insertedLeads.length > 0) {
      for (const lead of insertedLeads) {
        await enqueueJob({
          type: "GENERATE_EMAIL",
          leadId: lead.id,
          payload: {
            language: "en", // alles gewoon Engels, zoals jij wilde
            autoApprove: true,
            extraContext: "First contact for ContractGuard AI.",
          },
        });
        jobsCreated++;
      }
    }

    return res.status(200).json({
      inserted: insertedLeads?.length || 0,
      jobsCreated,
    });
  } catch (err: any) {
    console.error("bulk-leads error:", err);
    return res
      .status(500)
      .json({ error: err.message || "Unknown error" });
  }
}
