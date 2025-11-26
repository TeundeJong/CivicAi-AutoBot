import { supabaseAdmin } from "../lib/supabaseAdmin";
import { openai } from "../lib/openaiClient";
import { JobType, MarketingJobPayload } from "../lib/jobs";

interface RawJob {
  id: string;
  type: JobType;
  status: string;
  lead_id: string | null;
  payload: MarketingJobPayload | null;
  attempts: number;
}

// --------- helpers ---------

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

// Brand + email layout config
const BRAND = {
  productName: "ContractGuard AI",
  companyName: "CivicAi Solutions",
  senderName: "Teun – ContractGuard AI",
  websiteUrl: process.env.WEBSITE_URL || "https://app.contractguardhq.com/",
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

function isDutchDomain(email: string | null): boolean {
  if (!email) return false;
  const [, domain] = email.split("@");
  if (!domain) return false;
  const parts = domain.toLowerCase().split(".");
  const tld = parts[parts.length - 1];
  if (tld === "nl") return true;
  // .be moet Engels, dus niet als NL tellen
  return false;
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
  <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 15px; color: #111; line-height: 1.5;">
    <div style="border-bottom: 1px solid #eee; padding-bottom: 8px; margin-bottom: 16px;">
      <strong>${BRAND.productName}</strong><span style="color:#999"> · ${BRAND.companyName}</span>
    </div>
    ${escaped}
    <div style="border-top: 1px solid #eee; padding-top: 12px; margin-top: 16px; font-size: 12px; color:#777;">
      <div>${BRAND.senderName}</div>
      ${websiteHtml}
      <div style="margin-top:4px;">
        If you’d rather not hear about this again, just reply and I’ll remove you.
      </div>
    </div>
  </div>
  `;
}

// --------- Handlers ---------

async function handleGenerateEmail(job: RawJob): Promise<void> {
  const payload = job.payload || {};
  const autoApprove = payload.autoApprove ?? false;
  const explicitLang = payload.language as "nl" | "en" | undefined;

  const lead = await getLead(job.lead_id);
  if (!lead) throw new Error("Lead not found");

  const firstName = inferFirstName(lead.email, lead.name);
  const companyName = inferCompanyName(lead.email, lead.company);

  // taal bepalen
  let lang: "nl" | "en" = explicitLang || "en";
  if (!explicitLang) {
    lang = isDutchDomain(lead.email) ? "nl" : "en";
  }

  const greeting =
    lang === "nl"
      ? firstName
        ? `Hoi ${firstName},`
        : "Hoi,"
      : firstName
      ? `Hi ${firstName},`
      : "Hi,";

  const systemPrompt =
    lang === "nl"
      ? "Je bent een Nederlandse B2B-marketeer. Je schrijft korte, duidelijke, professionele maar menselijk klinkende mails. Geen typische AI-zinnen, geen overdreven beleefdheid."
      : "You are a B2B marketer. You write short, clear, professional but human emails. Avoid generic AI phrasing.";

  const userPrompt =
    lang === "nl"
      ? `
Schrijf een korte cold outreach e-mail (max 140 woorden) in het Nederlands.

Context:
- Product: ${BRAND.productName}
- Wat het doet: scant contracten automatisch op risico's, ontbrekende clausules en actiepunten voordat iemand tekent.
- Doelgroep: founders, managers of juridische rollen in mkb/scale-ups.
- Doel: een gesprek starten of een korte demo voorstellen, geen harde salespitch.

Lead:
- Naam: "${firstName || ""}"
- Bedrijf: "${companyName || ""}"
- E-mailadres: "${lead.email}"
- Rol/functie: "${lead.role || ""}"

Regels:
- Max 6–8 korte zinnen.
- Klink alsof een echt mens dit schrijft, niet als een AI.
- Geen buzzwords, geen marketing-taal, gewoon duidelijk.
- Noem het bedrijf hooguit één keer subtiel, als dat logisch voelt.
- Eindig met een vriendelijke afsluiting zoals "Groet," of "Hartelijke groet," en mijn naam (Teun).

Extra context campagne (optioneel):
${payload.extraContext || ""}
      `
      : `
Write a short cold outreach email (max 140 words) in English.

Context:
- Product: ${BRAND.productName}
- What it does: automatically scans contracts for risks, missing clauses and action points before someone signs.
- Target: founders, managers or legal roles in small and medium businesses.
- Goal: start a conversation or offer a short demo, not a hard sell.

Lead:
- Recipient name: "${firstName || ""}"
- Company: "${companyName || ""}"
- Email: "${lead.email}"
- Role: "${lead.role || ""}"

Rules:
- Maximum 6–8 short sentences.
- Plain, human language – no buzzwords, no hype.
- Do NOT mention that this email was generated by AI or is automated.
- Optionally mention the company once, if available, but keep it subtle.
- End with a friendly closing like "Best," or "Kind regards," and my name (Teun).

Extra campaign context (optional):
${payload.extraContext || ""}
      `;

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content:
          "You write simple, human-sounding outreach emails that feel like a real person wrote them.",
      },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.5,
    max_tokens: 400,
  });

  const rawBody = completion.choices[0]?.message?.content?.trim() || "";
  const finalBodyPlain = `${greeting}\n\n${rawBody}`;
  const htmlBody = wrapEmailHtml(finalBodyPlain);

  const subjectFromAI = rawBody
    .split("\n")[0]
    .replace(/^subject:\s*/i, "")
    .slice(0, 120);

  const subject =
    payload.subject ||
    subjectFromAI ||
    (companyName
      ? lang === "nl"
        ? `Korte vraag over jullie contracten bij ${companyName}`
        : `Quick question about your contracts at ${companyName}`
      : lang === "nl"
      ? "Korte vraag over je contracten"
      : "Quick question about your contracts");

  const status = autoApprove ? "approved" : "draft";

  const { error } = await supabaseAdmin.from("email_outbox").insert({
    job_id: job.id,
    lead_id: job.lead_id,
    to_email: lead.email,
    subject,
    body: htmlBody,
    status,
    campaign_name: payload.campaignName || "ContractGuard cold outreach",
  });

  if (error) throw error;
}

async function handleGenerateLinkedInDM(job: RawJob): Promise<void> {
  const payload = job.payload || {};
  const lead = await getLead(job.lead_id);
  if (!lead) throw new Error("Lead not found");

  const name = lead.name || inferFirstName(lead.email, lead.name);
  const company = inferCompanyName(lead.email, lead.company);

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content:
          "Je schrijft korte, rustige LinkedIn DM's in het Nederlands of Engels, afhankelijk van de prompt. Max 4 zinnen, menselijk, niet pushy.",
      },
      {
        role: "user",
        content: `
Schrijf een LinkedIn DM voor Teun.

Lead:
- Naam: ${name || ""}
- Bedrijf: ${company || ""}
- Rol: ${lead.role || ""}

Context:
- Teun bouwt ${BRAND.productName}, een tool die contracten scant op risico's.
- Doel: rustig peilen of dit relevant is voor hun werk/bedrijf, geen harde pitch.

Schrijf de DM in ${payload.language === "nl" ? "het Nederlands" : "Engels"}.
        `,
      },
    ],
    temperature: 0.5,
    max_tokens: 200,
  });

  const dm = completion.choices[0]?.message?.content?.trim() || "";

  const { error } = await supabaseAdmin.from("linkedin_content").insert({
    type: "dm",
    lead_id: job.lead_id,
    content: dm,
    status: payload.autoApprove ? "approved" : "draft",
  });

  if (error) throw error;
}

// --------- dispatcher ---------

export async function processJob(job: RawJob): Promise<void> {
  switch (job.type) {
    case "GENERATE_EMAIL":
      return handleGenerateEmail(job);
    case "GENERATE_LINKEDIN_DM":
      return handleGenerateLinkedInDM(job);
    default:
      // Unknown job type -> mark as failed
      console.warn("Unknown job type", job.type);
      return;
  }
}
