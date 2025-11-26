// src/lib/processors.ts
import { supabaseAdmin, Lead } from "./supabaseAdmin";
import { MarketingJob } from "./supabaseAdmin";
import { generateSalesEmail } from "./openaiClient";

export async function processGenerateEmailJob(job: MarketingJob) {
  if (!job.lead_id) {
    throw new Error("Job heeft geen lead_id");
  }

  const { data: leadData, error: leadErr } = await supabaseAdmin
    .from("leads")
    .select("*")
    .eq("id", job.lead_id)
    .single();

  if (leadErr) throw leadErr;
  const lead = leadData as Lead;

  const payload = job.payload || {};
  const language: "nl" | "en" = payload.language || "en";

  const { subject, body } = await generateSalesEmail({
    language,
    leadName: lead.name,
    company: lead.company,
    extraContext: payload.extraContext,
  });

  // Draft in email_outbox aanmaken
  const autoApprove = !!payload.autoApprove;

  const { error: insertErr } = await supabaseAdmin.from("email_outbox").insert({
    lead_id: lead.id,
    to_email: lead.email,
    subject,
    body,
    status: autoApprove ? "approved" : "draft",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (insertErr) throw insertErr;
}
