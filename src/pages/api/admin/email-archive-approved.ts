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

    const { data, error } = await supabaseAdmin
      .from("email_outbox")
      .select("id,to_email,subject,body,status,created_at,leads(name,company)")
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
    for (const r of rows) {
      const name = r.leads?.name ?? "";
      const company = r.leads?.company ?? "";
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
    const { error: updErr } = await supabaseAdmin
      .from("email_outbox")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .in("id", ids);

    if (updErr) throw updErr;

    return res.status(200).json({ archived: ids.length, filename, csv });
  } catch (err: any) {
    console.error("admin/email-archive-approved error", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
