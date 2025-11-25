import { supabaseAdmin } from "./supabaseAdmin";
import { openai } from "./openaiClient";
import { JobType, MarketingJobPayload } from "./jobs";

interface RawJob {
  id: string;
  type: JobType;
  status: string;
  lead_id: string | null;
  payload: MarketingJobPayload;
  attempts: number;
}

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

export async function processJob(job: RawJob): Promise<void> {
  switch (job.type) {
    case "GENERATE_EMAIL":
      await handleGenerateEmail(job);
      break;
    case "GENERATE_LINKEDIN_DM":
      await handleGenerateLinkedInDM(job);
      break;
    default:
      throw new Error(`Unsupported job type: ${job.type}`);
  }
}

async function handleGenerateEmail(job: RawJob) {
  const lead = await getLead(job.lead_id);
  const payload = job.payload || {};
  const lang = payload.language ?? "nl";
  const campaignName = payload.campaignName ?? "ContractGuard outreach";

  const name = lead?.name || "";
  const company = lead?.company || "";
  const role = lead?.role || "";
  const extra = payload.extraContext || "";

  const systemPrompt =
    lang === "nl"
      ? "Je bent een Nederlandse B2B-marketeer. Je schrijft korte, duidelijke, professionele maar menselijk klinkende mails. Geen typische AI-zinnen, geen overdreven beleefdheid."
      : "You are a B2B marketer. You write short, clear, professional but human emails. Avoid generic AI phrasing.";

  const userPrompt =
    lang === "nl"
      ? `
Schrijf een korte outreach e-mail (max 140 woorden) aan ${name} (${role}) bij ${company}.

Doel:
- Uitleggen dat ik een tool heb (ContractGuard AI) die contracten automatisch scant op risico's en gaten, zodat ze minder tijd kwijt zijn en minder fouten maken.
- De mail moet voelen alsof hij door een mens is geschreven: concreet, geen marketing-blabla, geen "as an AI" onzin.
- 1 duidelijke call-to-action (bijv: een kort antwoord, of een voorbeeldcontract sturen).

Extra context:
${extra}
      `
      : `
Write a short outreach email (max 140 words) to ${name} (${role}) at ${company}.

Goal:
- Explain that I have a tool (ContractGuard AI) that automatically scans contracts for risks and gaps.
- The email must feel human: concrete, no fluffy buzzwords, no "as an AI" phrases.
- End with one clear call to action.

Extra context:
${extra}
      `;

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const text = completion.choices[0]?.message?.content ?? "";

  const subject =
    text.split("\n")[0].replace(/^subject:\s*/i, "").slice(0, 120) ||
    (lang === "nl"
      ? "Kort over je contracten"
      : "Quick note about your contracts");

  const body = text;

  const toEmail = lead?.email;
  if (!toEmail) {
    throw new Error("Lead has no email");
  }

  const { error } = await supabaseAdmin.from("email_outbox").insert({
    lead_id: job.lead_id,
    to_email: toEmail,
    subject,
    body,
    status: "draft",
    campaign_name: campaignName,
  });

  if (error) throw error;
}

async function handleLinkedInCommon(
  job: RawJob,
  contentType: "dm"
) {
  const lead = await getLead(job.lead_id);
  const name = lead?.name || "";
  const company = lead?.company || "";

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content:
          "Je schrijft korte, rustige LinkedIn DM's in het Nederlands. Max 4 zinnen, menselijk, niet pushy.",
      },
      {
        role: "user",
        content: `
Schrijf een LinkedIn DM aan ${name} van ${company}.

Doel:
- Kort aangeven dat ik werk aan ContractGuard AI, een tool die contracten scant op risico's.
- Vraag of dit relevant is voor hun werk / bedrijf.
- Geen harde salespitch, meer een rustige opening.
        `,
      },
    ],
  });

  const dm = completion.choices[0]?.message?.content ?? "";

  const { error } = await supabaseAdmin.from("linkedin_content").insert({
    type: contentType,
    lead_id: job.lead_id,
    content: dm,
    status: "draft",
  });

  if (error) throw error;
}

async function handleGenerateLinkedInDM(job: RawJob) {
  await handleLinkedInCommon(job, "dm");
}
