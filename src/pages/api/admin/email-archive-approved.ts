// src/pages/api/admin/email-archive-approved.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

/**
 * Archive all APPROVED emails:
 * - Exports a CSV snapshot (so you can store it separately)
 * - Moves status from approved -> archived (keeps them out of Draft)
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
    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, "-");
    const filename = `approved-emails-${stamp}.csv`;

    // IMPORTANT:
    // Avoid relying on implicit PostgREST relationship selects (e.g. leads(...)).
    // Some Supabase projects don't expose the relation name as "leads" and will
    // throw: "Could not find a relationship between 'email_outbox' and 'leads'".
    // We fetch lead_id first, then join in a second query.
    const { data, error } = await supabaseAdmin
      .from("email_outbox")
      .select("id,lead_id,to_email,subject,body,status,created_at")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(5000);

    if (error) throw error;

    const rows = (data || []) as any[];
    if (!rows.length) {
      return res.status(200).json({ archived: 0, filename, csv: "" });
    }

    // --- Build CSV (simple, safe escaping) ---
    const header = [
      "name",
      "company",
      "to_email",
      "subject",
      "body",
      "created_at",
    ];

    const esc = (v: any) => {
      const s = (v ?? "").toString();
      // CSV escape: wrap in quotes and double internal quotes
      return `"${s.replace(/"/g, '""')}"`;
    };

    const lines: string[] = [];
    lines.push(header.join(","));
    // Fetch leads (best-effort). If lead records are missing, we just export blanks.
    const leadIds = Array.from(
      new Set(rows.map((r) => r.lead_id).filter(Boolean))
    );
    let leadById: Record<string, { name: string | null; company: string | null }> = {};
    if (leadIds.length) {
      const { data: leads, error: leadErr } = await supabaseAdmin
        .from("leads")
        .select("id,name,company")
        .in("id", leadIds);
      if (!leadErr && Array.isArray(leads)) {
        for (const l of leads as any[]) {
          if (l?.id) leadById[l.id] = { name: l.name ?? null, company: l.company ?? null };
        }
      }
    }

    for (const r of rows) {
      const lead = r.lead_id ? leadById[r.lead_id] : undefined;
      const name = lead?.name ?? "";
      const company = lead?.company ?? "";
      lines.push(
        [
          esc(name),
          esc(company),
          esc(r.to_email),
          esc(r.subject),
          esc(r.body),
          esc(r.created_at),
        ].join(",")
      );
    }

    const csv = lines.join("\n");

    // --- Move approved -> archived ---
    const ids = rows.map((r) => r.id).filter(Boolean);
    // Some deployments don't have an `updated_at` column on `email_outbox`.
    // Including it makes PostgREST return a 400 (Bad Request).
    // Keep this PATCH-only: update only the status.
    const { error: updErr } = await supabaseAdmin
      .from("email_outbox")
      .update({ status: "archived" })
      .in("id", ids);

    if (updErr) throw updErr;

    return res.status(200).json({ archived: ids.length, filename, csv });
  } catch (err: any) {
    console.error("admin/email-archive-approved error", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
