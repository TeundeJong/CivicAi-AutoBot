import { supabaseAdmin } from "./supabaseAdmin";
import { openai } from "./openaiClient";
import { JobType, MarketingJobPayload } from "./jobs";

/* ============================================================
   BRANDING & CONSTANTS
============================================================ */

const BRAND = {
  productName: "ContractGuard AI",
  companyName: "CivicAi Solutions",
  senderName: "Teun – CivicAi Solutions",
  websiteUrl: "https://app.contractguardhq.com/",
};

const GENERIC_LOCAL_PARTS = [
  "info",
  "support",
  "contact",
  "hello",
  "sales",
  "admin",
  "office",
  "team",
  "hi",
  "service",
];

/* ============================================================
   HELPER FUNCTIES
============================================================ */

function inferFirstName(email: string | null, fullName?: string | null): string {
  if (fullName) {
    const first = fullName.trim().split(/\s+/)[0];
    if (first && first.length > 1) return first;
  }
  if (!email) return "";

  const [localPart] = email.split("@");
  if (!localPart) return "";

  const cleanLocal = localPart.toLowerCase().replace(/\.+/g, " ");
  if (GENERIC_LOCAL_PARTS.includes(cleanLocal)) return "";

  const candidate = cleanLocal.split(/[._-]/)[0];
  if (candidate && candidate.length > 1) {
    return candidate.charAt(0).toUpperCase() + candidate.slice(1);
  }

  return "";
}

function inferCompanyName(email: string | null, explicitCompany?: string | null): string {
  if (explicitCompany && explicitCompany.trim().length > 1) {
    return explicitCompany.trim();
  }
  if (!email) return "";

  const [, domain] = email.split("@");
  if (!domain) return "";

  const parts = domain.toLowerCase().split(".");
  if (parts.length < 2) return "";

  const tlds = ["com", "nl", "io", "app", "ai", "co", "net", "org", "de", "fr", "es", "be", "uk"];

  let root = parts[parts.length - 2];
  if (tlds.includes(root) && parts.length >= 3) {
    root = parts[parts.length - 3];
  }

  const words = root.split(/[-_]/).filter(Boolean);
  if (words.length === 0) return "";

  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function wrapEmailHtml(plainBody: string): string {
  const escaped = plainBody.trim().replace(/\n/g, "<br />");

  const websiteHtml = BRAND.websiteUrl
    ? `<div><a href="${BRAND.websiteUrl}" target="_blank" style="color:#406AFF;text-decoration:none;">${BRAND.websiteUrl.replace(
        /^https?:\/\//,
        ""
      )}</a></div>`
    : "";

  return `
  <div style="font-family: system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;color:#111;line-height:1.5;">
    <div style="border-bottom:1px solid #eee;padding-bottom:8px;margin-bottom:16px;">
      <strong>${BRAND.productName}</strong><span style="color:#999"> · ${BRAND.companyName}</span>
    </div>
    ${escaped}
    <div style="border-top:1px solid #eee;padding-top:12px;margin-top:16px;font-size:12px;color:#777;">
      <div>${BRAND.senderName}</div>
      ${websiteHtml}
      <div style="margin-top:4px;">
        If you’d rather not hear about this again, just reply and I’ll remove you.
      </div>
    </div>
  </div>
  `;
}

function pickSubject(firstName: string, companyName: string): string {
  const hasCompany = companyName && companyName.length > 1;
  const baseCompany = hasCompany ? companyName : "your company";

  const subjects = [
    `Quick question about contract risks at ${baseCompany}`,
    `Idea to save time reviewing contracts at ${baseCompany}`,
    `Small suggestion for your contract process at ${baseCompany}`,
    hasCompany
      ? `Thought about how ${baseCompany} reviews contracts`
      : `Quick idea about how you review contracts`,
  ];

  const idx = Math.floor(Math.random() * subjects.length);
  return subjects[idx];
}

/* ============================================================
   LEAD FETCHER
============================================================ */

async function getLead(leadId: string | null) {
  if (!leadId) return null;
  const { data, error } = await supabaseAdmin
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .single();
  if (error) throw error;
  return data;
}

/* ============================================================
   MAIN JOB HANDLER
============================================================ */

export async function processJob(job: any & { type: JobType }): Promise<void> {
  switch (job.type) {
    /* =====================================================================
       EMAIL GENERATOR — FULL v3 UPGRADE
    ===================================================================== */
    case "GENERATE_EMAIL": {
      const payload = job.payload || {};
      const language = payload.language || "en";
      const autoApprove = payload.autoApprove ?? false;

      const { data: lead, error: leadError } = await supabaseAdmin
        .from("leads")
        .select("id,email,name,company,role")
        .eq("id", job.lead_id)
        .maybeSingle();

      if (leadError || !lead) {
        throw new Error("Lead not found for GENERATE_EMAIL job");
      }

      const firstName = inferFirstName(lead.email, lead.name);
      const companyName = inferCompanyName(lead.email, lead.company);
      const greeting = firstName ? `Hi ${firstName},` : "Hi,";

      /* -------------------------
         AI PROMPT (ENG ONLY)
      ------------------------- */
      const prompt = `
Write a short, natural-sounding cold outreach email in ${language}.

Context:
- Product: ${BRAND.productName}
- What it does: scans contracts automatically for risks, missing clauses and action points before signing.
- Target: founders, managers or legal roles in SMBs.
- Goal: start a soft conversation or offer a short demo. No hard sell.

Lead:
- Recipient name: "${firstName}"
- Company: "${companyName}"
- Email: "${lead.email}"
- Role: "${lead.role || ""}"

Rules:
- Max 6–8 short sentences.
- Human tone. No buzzwords. No AI phrases.
- Mention the company subtly (if available).
- Never say "as an AI". Never apologize.
- CTA: offer to send a quick example report or demo.

Extra campaign context:
${payload.extraContext || ""}
`;

      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content:
              "You write simple, human-sounding outreach emails that feel written by a real person.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.5,
        max_tokens: 400,
      });

      const rawBody = completion.choices[0].message?.content?.trim() || "";
      const fullText = `${greeting}\n\n${rawBody}`;

      const htmlBody = wrapEmailHtml(fullText);
      const subject = payload.subject || pickSubject(firstName, companyName);
      const status = autoApprove ? "approved" : "draft";

      await supabaseAdmin.from("email_outbox").insert({
        job_id: job.id,
        lead_id: job.lead_id,
        to_email: lead.email,
        subject,
        body: htmlBody,
        status,
      });

      return;
    }

    /* =====================================================================
       LINKEDIN DM GENERATOR (ORIGINEEL — GELATEN)
    ===================================================================== */
    case "GENERATE_LINKEDIN_DM": {
      const lead = await getLead(job.lead_id);
      const name = lead?.name || "";
      const company = lead?.company || "";

      const completion = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content:
              "You write short, natural LinkedIn DMs in Dutch. Max 4 sentences, calm, human.",
          },
          {
            role: "user",
            content: `
Schrijf een LinkedIn DM aan ${name} van ${company}.
Doel:
- Kort aangeven wat ContractGuard AI doet.
- Vraag of dit relevant is.
- Niet pushy.
`,
          },
        ],
      });

      const dm = completion.choices[0]?.message?.content ?? "";

      const { error } = await supabaseAdmin.from("linkedin_content").insert({
        type: "dm",
        lead_id: job.lead_id,
        content: dm,
        status: "draft",
      });

      if (error) throw error;
      return;
    }

    default:
      throw new Error("Unknown job type: " + job.type);
  }
}
