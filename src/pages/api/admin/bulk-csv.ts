// /api/admin/bulk-csv.ts

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rows = body.rows || [];
    const makeJobs = body.makeJobs ?? false;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: "No rows provided" },
        { status: 400 }
      );
    }

    // ---- Leads cleanen ----
    const leadsToInsert = rows
      .map((r) => {
        const email = r.email?.trim()?.toLowerCase();
        if (!email || !email.includes("@")) return null;

        return {
          email,
          name: r.name || null,
          company: r.company || null,
        };
      })
      .filter(Boolean);

    if (leadsToInsert.length === 0) {
      return NextResponse.json(
        { error: "No valid emails in rows" },
        { status: 400 }
      );
    }

    // ---- Insert leads ----
    const { data: insertedLeads, error: leadErr } = await supabaseAdmin
      .from("leads")
      .insert(leadsToInsert)
      .select("id, email, name, company");

    if (leadErr) {
      console.error("Lead insert error:", leadErr);
      return NextResponse.json({ error: leadErr.message }, { status: 500 });
    }

    let jobsCreated = 0;

    if (makeJobs) {
      // 1 job per lead (emailDraft + dmDraft)
      const jobs = insertedLeads.map((lead) => ({
        type: "GENERATE_EMAIL",
        lead_id: lead.id,
        payload: {
          autoApprove: true,
          language: lead.email.endsWith(".nl") ? "nl" : "en",
          extraContext: "First contact for ContractGuard AI.",
        },
      }));

      const { error: jobsErr } = await supabaseAdmin.from("jobs").insert(jobs);
      if (jobsErr) {
        console.error("Job insert error:", jobsErr);
        return NextResponse.json({ error: jobsErr.message }, { status: 500 });
      }

      jobsCreated = jobs.length;
    }

    return NextResponse.json({
      inserted: leadsToInsert.length,
      jobsCreated,
    });
  } catch (err: any) {
    console.error("bulk-csv error:", err);
    return NextResponse.json(
      { error: err.message || "Unknown error" },
      { status: 500 }
    );
  }
}
