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

/**
 * Infer a simple language choice from the lead email.
 * - .nl domains -> nl
 * - everything else -> en
 * (Patch-only: we don't have a country field in leads yet.)
 */
function inferLanguageFromEmail(email: string): "nl" | "en" {
  const lower = (email || "").toLowerCase().trim();
  // Match domain TLD .nl (e.g. name@company.nl)
  if (/@[^@]+\.nl\b/.test(lower)) return "nl";
  return "en";
}

function renderTemplate(
  templateText: string,
  vars: { name: string; company: string; email: string; snippet?: string }
): { subject: string; body: string } {
  const t = (templateText || "").replace(/\r\n/g, "\n").trim();
  const lines = t.split("\n");

  // first non-empty line is subject
  const firstNonEmptyIndex = lines.findIndex((l) => l.trim().length > 0);
  const subjectLine =
    firstNonEmptyIndex >= 0 ? lines[firstNonEmptyIndex].trim() : "";
  const subject = subjectLine
    .replace(/^(onderwerp|subject)\s*[:\-]\s*/i, "")
    .trim();

  const bodyLines =
    firstNonEmptyIndex >= 0 ? lines.slice(firstNonEmptyIndex + 1) : [];
  let body = bodyLines.join("\n").trim();

  const rep = (s: string) =>
    s
      .replace(/\{\{\s*name\s*\}\}/gi, vars.name || "")
      .replace(/\{\{\s*company\s*\}\}/gi, vars.company || "")
      .replace(/\{\{\s*email\s*\}\}/gi, vars.email || "");

  const cleanedSubject = rep(subject) || subject || "ContractGuard AI";
  body = rep(body);

  // Optional snippet appended (keeps existing personalization intact)
  const snippet = (vars.snippet || "").trim();
  if (snippet.length > 0) {
    body = body.length > 0 ? `${body}\n\n${snippet}` : snippet;
  }

  return {
    subject: cleanedSubject,
    body,
  };
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
    const { lines, emailSnippet, emailTemplateEN, emailTemplateNL } = (req.body || {}) as {
      lines?: string;
      emailSnippet?: string;
      emailTemplateEN?: string;
      emailTemplateNL?: string;
    };

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
            const snippet =
        typeof emailSnippet === "string" && emailSnippet.trim().length > 0
          ? emailSnippet.trim()
          : "";

      const lang = inferLanguageFromEmail(lead.email);

      const templateText =
        lang === "nl"
          ? typeof emailTemplateNL === "string"
            ? emailTemplateNL
            : ""
          : typeof emailTemplateEN === "string"
          ? emailTemplateEN
          : "";

      let subject = "";
      let body = "";

      if (templateText && templateText.trim().length > 0) {
        // Deterministic template mode (safer, no AI surprises)
        const rendered = renderTemplate(templateText, {
          name: lead.name || "",
          company: lead.company || "",
          email: lead.email,
          snippet,
        });
        subject = rendered.subject;
        body = rendered.body;
      } else {
        // Fallback: existing AI generator
        const ai = await generateSalesEmail({
          language: lang,
          leadName: lead.name,
          company: lead.company,
          extraContext:
            "First contact for ContractGuard AI." +
            (snippet ? `

Additional context to include:
${snippet}` : ""),
        });
        subject = ai.subject;
        body = ai.body;
      }

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
