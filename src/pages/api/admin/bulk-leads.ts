// src/pages/api/admin/bulk-leads.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { generateSalesEmail } from "../../../lib/openaiClient";

type ParsedRow = {
  email: string;
  name: string | null;
  company: string | null;
};

function parseLines(lines: string): ParsedRow[] {
  return lines
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      if (!line.includes("@")) return null;

      const parts = line.split(",").map((p) => p.trim()).filter(Boolean);

      // zoek iets met @ erin
      let emailPart = parts.find((p) => p.includes("@"));
      if (!emailPart) {
        emailPart = line.trim();
      }
      const email = emailPart.toLowerCase();

      let name: string | null = null;
      let company: string | null = null;

      // simpele interpretatie: "Name, Company, email"
      if (parts.length >= 2) {
        if (parts[0] && parts[0] !== emailPart) {
          name = parts[0];
        }
        if (parts[1] && parts[1] !== emailPart) {
          company = parts[1];
        }
      }

      return { email, name, company };
    })
    .filter(
      (row): row is ParsedRow =>
        !!row && !!row.email && row.email.includes("@")
    );
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
    const { lines } = (req.body || {}) as { lines?: string };

    if (!lines || !lines.trim()) {
      return res.status(400).json({ error: "No lines provided" });
    }

    const parsed = parseLines(lines);

    if (!parsed.length) {
      return res
        .status(400)
        .json({ error: "No valid e-mail addresses found in input" });
    }

    // 1) Leads inserten
    const { data: insertedLeads, error: leadsError } = await supabaseAdmin
      .from("leads")
      .insert(
        parsed.map((r) => ({
          email: r.email,
          name: r.name,
          company: r.company,
        }))
      )
      .select("id, email, name, company");

    if (leadsError || !insertedLeads) {
      console.error("Insert leads error:", leadsError);
      return res
        .status(500)
        .json({ error: leadsError?.message || "Insert leads failed" });
    }

    // 2) Voor elke lead direct een e-mail laten schrijven en als draft in email_outbox zetten
    let emailsCreated = 0;

// alles parallel draaien, zodat het niet lead-voor-lead hoeft
await Promise.all(
  insertedLeads.map(async (lead) => {
    try {
      const { subject, body } = await generateSalesEmail({
        language: "en", // alles Engels
        leadName: lead.name,
        company: lead.company,
        extraContext: "First contact for ContractGuard AI.",
      });

      const { error: outErr } = await supabaseAdmin
        .from("email_outbox")
        .insert({
          to_email: lead.email,
          subject,
          body,
          status: "draft", // jij keurt daarna goed
          lead_id: lead.id,
        });

      if (outErr) {
        console.error("email_outbox insert error for", lead.email, outErr);
        return;
      }

      emailsCreated++;
    } catch (err) {
      console.error("generateSalesEmail failed for", lead.email, err);
    }
  })
);


    return res.status(200).json({
      inserted: insertedLeads.length,
      emailsCreated,
    });
  } catch (err: any) {
    console.error("bulk-leads error:", err);
    return res
      .status(500)
      .json({ error: err.message || "Unknown server error" });
  }
}
