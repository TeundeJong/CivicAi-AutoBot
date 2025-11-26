// src/lib/processors.ts
import { supabaseAdmin } from "./supabaseAdmin";

/**
 * Job types die de cron kan verwerken.
 */
export type JobType =
  | "GENERATE_EMAIL"
  | "GENERATE_LINKEDIN_POSTS"
  | "GENERATE_LINKEDIN_DMS";

/**
 * Vorm van een job zoals hij in de tabel `marketing_jobs` staat.
 * We houden het type expres "losjes" zodat Supabase-responses gewoon passen.
 */
export type Job = {
  id: string;
  type: JobType | string;
  status?: string | null;
  lead_id?: string | null;
  payload?: any;
  created_at?: string | null;
};

/**
 * Centrale entrypoint: wordt vanuit /api/cron-processJobs aangeroepen.
 */
export async function processJob(job: Job): Promise<void> {
  switch (job.type) {
    case "GENERATE_EMAIL":
      await handleGenerateEmail(job);
      break;

    case "GENERATE_LINKEDIN_POSTS":
      await handleGenerateLinkedIn(job, "post");
      break;

    case "GENERATE_LINKEDIN_DMS":
      await handleGenerateLinkedIn(job, "dm");
      break;

    default:
      console.warn("[processors] Onbekend job type:", job.type);
  }
}

/* ------------------------------------------------------------------ */
/*  OpenAI helper                                                     */
/* ------------------------------------------------------------------ */

async function callOpenAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY ontbreekt in de env vars");
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.8,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("OpenAI error:", text);
    throw new Error(`OpenAI request failed (${res.status})`);
  }

  const json: any = await res.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("OpenAI antwoord bevat geen tekst");
  }
  return content.trim();
}

/* ------------------------------------------------------------------ */
/*  1) GENERATE_EMAIL                                                 */
/* ------------------------------------------------------------------ */

async function handleGenerateEmail(job: Job): Promise<void> {
  if (!job.lead_id) {
    console.warn("[GENERATE_EMAIL] Job heeft geen lead_id, skip", job.id);
    return;
  }

  // Lead ophalen
  const { data: lead, error: leadError } = await supabaseAdmin
    .from("leads")
    .select("*")
    .eq("id", job.lead_id)
    .maybeSingle();

  if (leadError) {
    console.error("[GENERATE_EMAIL] Lead error:", leadError);
    throw leadError;
  }
  if (!lead || !lead.email) {
    console.warn("[GENERATE_EMAIL] Geen lead of e-mail gevonden", job.lead_id);
    return;
  }

  const payload = job.payload || {};
  const extraContext: string = payload.extraContext || "";
  const autoApprove: boolean = !!payload.autoApprove;

  const systemPrompt =
    "You are a sales copywriter writing short, personal cold emails for a contract analysis tool called ContractGuard AI. You write in clear, professional but friendly English.";

  const userPrompt = `
Write one email in JSON format:

{
  "subject": "...",
  "body": "..."
}

Context:
- Tool: ContractGuard AI scans contracts for risks, gaps, ambiguities and action points.
- Lead name: ${lead.name ?? "unknown"}
- Company: ${lead.company ?? "unknown"}
- Extra context: ${extraContext}

Rules:
- Max 120 words in the body.
- No hard push, focus on "this might help you reduce risk / save time".
- Use a single clear call to action (reply or book a short demo).
`;

  const raw = await callOpenAI(systemPrompt, userPrompt);

  let parsed: { subject?: string; body?: string } = {};
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const jsonText = start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
    parsed = JSON.parse(jsonText);
  } catch (e) {
    console.warn("[GENERATE_EMAIL] Could not parse JSON, using raw content as body");
    parsed = { subject: "Quick AI contract check", body: raw };
  }

  const subject =
    parsed.subject && parsed.subject.trim().length > 0
      ? parsed.subject.trim()
      : "Quick AI contract check";
  const body = parsed.body && parsed.body.trim().length > 0 ? parsed.body.trim() : raw;

  // actieve afzender kiezen (eerste actieve)
  const { data: senders } = await supabaseAdmin
    .from("sender_accounts")
    .select("id")
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  const sender = senders && senders.length > 0 ? senders[0] : null;

  const status = autoApprove ? "approved" : "draft";

  const { error: insertError } = await supabaseAdmin.from("email_outbox").insert({
    lead_id: job.lead_id,
    to_email: lead.email,
    subject,
    body,
    status,
    sender_account_id: sender ? sender.id : null,
  });

  if (insertError) {
    console.error("[GENERATE_EMAIL] Could not store email:", insertError);
    throw insertError;
  }

  console.log(
    `[GENERATE_EMAIL] Email added to outbox (status=${status}) for lead ${lead.email}`
  );
}


/* ------------------------------------------------------------------ */
/*  2) GENERATE_LINKEDIN_POSTS / DMS                                  */
/* ------------------------------------------------------------------ */

async function handleGenerateLinkedIn(job: Job, type: "post" | "dm"): Promise<void> {
  const payload = job.payload || {};

  const count: number =
    typeof payload.count === "number" && payload.count > 0 && payload.count <= 100
      ? payload.count
      : 20; // default 20

  const tone: string =
    typeof payload.tone === "string" && payload.tone.trim().length > 0
      ? payload.tone
      : "approachable, professional, slightly opinionated";

  const systemPromptBase =
    "You write short, punchy LinkedIn content about handling contracts smarter with ContractGuard AI.";

  const isPost = type === "post";

  const userPrompt = `
Generate ${count} unique ${isPost ? "LinkedIn posts" : "LinkedIn DM messages"} as a JSON array of strings.

Example output:
[
  "First text...",
  "Second text..."
]

Context:
- Product: ContractGuard AI (SaaS) that scans contracts (PDF/text) for risks, gaps, ambiguities and action points.
- Target audience: founders, agencies, small legal teams, consultants.
- Tone of voice: ${tone}.
- CTA: soft call to action ("reply if you want a quick contract check", "try a scan", etc.).

Post rules:
- For posts: 60–130 words per post, no hashtag spam (max 3 hashtags or none).
- No empty hype, share concrete benefits and examples.
- Mix of education, light urgency and social proof.

DM rules:
- For DMs: 40–80 words, personal, no mass-spam feel.
- No hard selling, more like: "I think this could help, want me to take a look?".

Write everything in English.
`;

  const raw = await callOpenAI(systemPromptBase, userPrompt);

  let items: string[] = [];
  try {
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    const jsonText = start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
    const parsed = JSON.parse(jsonText);
    if (Array.isArray(parsed)) {
      items = parsed
        .map((x) => (typeof x === "string" ? x.trim() : ""))
        .filter((x) => x.length > 0);
    }
  } catch (e) {
    console.warn("[GENERATE_LINKEDIN_*] Could not parse JSON, using raw as 1 item");
    if (raw.trim().length > 0) items = [raw.trim()];
  }

  if (items.length === 0) {
    console.warn("[GENERATE_LINKEDIN_*] No items to store");
    return;
  }

  const rows = items.map((content) => ({
    type,
    content,
    status: "draft",
  }));

  const { error: insertError } = await supabaseAdmin
    .from("linkedin_content")
    .insert(rows);

  if (insertError) {
    console.error("[GENERATE_LINKEDIN_*] Could not insert linkedin_content:", insertError);
    throw insertError;
  }

  console.log(
    `[GENERATE_LINKEDIN_${type.toUpperCase()}] ${rows.length} items stored as draft`
  );
}
