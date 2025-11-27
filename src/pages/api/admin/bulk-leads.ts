// src/pages/api/admin/bulk-leads.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { enqueueJob } from "../../../lib/jobs";

/**
 * Verwacht:
 *  {
 *    lines: "Name, Company, email@domain.com\nemail2@domain.com\n...",
 *    makeJobs?: boolean
 *  }
 *
 * De parsing-logica komt overeen met je dashboard:
 * - per regel:
 *   - "Name, Company, email"
 *   - of alleen "email"
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
    const { lines, makeJobs } = (req.body || {}) as {
      lines?: string;
      makeJobs?: boolean;
    };

    if (!lines || typeof lines !== "string") {
      return res
        .status(400)
        .json({ error: "Missing 'lines' string in body" });
    }

    // 1) Regels parsen
    const rawLines = lines
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (!rawLines.length) {
      return res.status(400).json({ error: "No lines to process" });
    }

    type ParsedLead = {
      email: string;
      name: string | null;
      company: string | null;
    };

    const parsed: ParsedLead[] = [];

    for (const line of rawLines) {
      // Probeer: Name, Company, email
      const parts = line.split(",").map((p) => p.trim());
      let email = "";
      let name: string | null = null;
      let company: string | null = null;

      if (parts.length === 1) {
        // Alleen email
        email = parts[0];
      } else if (parts.length === 2) {
        // bv: Name, email
        name = parts[0] || null;
        email = parts[1];
      } else {
        // 3 of meer: neem laatste als email, eerste als naam, tweede als company
        email = parts[parts.length - 1];
        name = parts[0] || null;
        company = parts[1] || null;
      }

      email = email.toLowerCase();

      if (!email || !email.includes("@")) {
        continue;
      }

      parsed.push({ email, name, company });
    }

    if (!parsed.length) {
      return res.status(400).json({ error: "No valid emails found" });
    }

    // 2) Leads inserten (upsert op email)
    const { data: leads, error: upsertErr } = await supabaseAdmin
      .from("leads")
      .upsert(
        parsed.map((p) => ({
          email: p.email,
          name: p.name,
          company: p.company,
        })),
        { onConflict: "email" }
      )
      .select("id, email, name, company");

    if (upsertErr) {
      console.error("bulk-leads upsert error:", upsertErr);
      return res.status(500).json({ error: upsertErr.message });
    }

    const insertedLeads = leads || [];
    let jobsCreated = 0;

    // 3) Optioneel: jobs in marketing_jobs creëren
    if (makeJobs) {
      for (const lead of insertedLeads) {
        await enqueueJob({
          type: "GENERATE_EMAIL",
          leadId: lead.id,
          payload: {
            language: "en", // alles Engels zoals jij wilt
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
    console.error("bulk-leads error:", err);
    return res
      .status(500)
      .json({ error: err.message || "Unknown server error" });
  }
}
