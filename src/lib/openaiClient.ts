// src/lib/openaiClient.ts
import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.warn("⚠️ OPENAI_API_KEY mist in .env.local");
}

export const openai = new OpenAI({
  apiKey: apiKey || "missing",
});

export async function generateSalesEmail(options: {
  language: "nl" | "en";
  leadName?: string | null;
  company?: string | null;
  extraContext?: string;
}) {
  const { language, leadName, company, extraContext } = options;

  const sys =
    language === "nl"
      ? "Je bent een B2B sales copywriter. Je schrijft korte, concrete, vriendelijke outreach mails over ContractGuard AI."
      : "You are a B2B sales copywriter. You write short, concrete, friendly outreach emails about ContractGuard AI.";

  const prompt =
    language === "nl"
      ? `Schrijf een korte eerste outreach e-mail over ContractGuard AI.
      
Naam: ${leadName || "-"}
Bedrijf: ${company || "-"}
Extra context: ${extraContext || "-"}

Regels:
- Max 140 woorden
- Onderwerp: 1 sterke, duidelijke zin
- Geen agressieve sales, wel duidelijk nut
- Eindig met een simpele call-to-action (bijv. "Zal ik je een korte demo sturen?").
- Eindig altijd met exact deze ondertekening:

Met vriendelijke groet,
Teun – CivicAi Solutions`
      : `Write a short first outreach email about ContractGuard AI.

Name: ${leadName || "-"}
Company: ${company || "-"}
Extra context: ${extraContext || "-"}

Rules:
- Max 140 words
- Subject: 1 strong, clear line
- Not pushy, but clear value
- End with a simple call-to-action (e.g. "Would you like a short demo?").
- Always end with exactly this signature:

Best regards,
Teun – CivicAi Solutions`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: sys },
      { role: "user", content: prompt },
    ],
  });

  const text = completion.choices[0].message.content || "";

  const [firstLine, ...rest] = text.split("\n").filter(Boolean);

  // Subject kan "Onderwerp: ..." of "Subject: ..." zijn → strip dat
  let subjectLine = firstLine.trim();
  subjectLine = subjectLine.replace(/^(onderwerp|subject)\s*[:\-]\s*/i, "").trim();

  let subject = subjectLine;
  let body = rest.join("\n").trim();

  if (!subject || !body) {
    // fallback
    subject =
      language === "nl"
        ? "ContractGuard AI – contracten sneller en veiliger"
        : "ContractGuard AI – faster, safer contracts";
    body = text;
  }

  // ---------- BODY POST-PROCESSING: fix "Your name" en handtekening ----------

  let cleanedBody = body;

  // Common varianten vervangen
  cleanedBody = cleanedBody.replace(
    /(Best regards,?\s*)(Your name|YOUR NAME|\[Your Name\])/gi,
    "Best regards,\nTeun – CivicAi Solutions"
  );

  cleanedBody = cleanedBody.replace(
    /(Met vriendelijke groet,?\s*)(jouw naam|je naam)/gi,
    "Met vriendelijke groet,\nTeun – CivicAi Solutions"
  );

  // Losse "Your name" opruimen
  cleanedBody = cleanedBody.replace(/\bYour name\b/gi, "Teun – CivicAi Solutions");

  // Als de juiste ondertekening nog NIET in de tekst zit, forceer hem
  if (!cleanedBody.includes("Teun – CivicAi Solutions")) {
    if (language === "en") {
      // trailing "Best regards," zonder naam weghalen
      cleanedBody = cleanedBody.replace(/Best regards,?\s*$/i, "").trim();
      cleanedBody += `\n\nBest regards,\nTeun – CivicAi Solutions`;
    } else {
      cleanedBody = cleanedBody.replace(/Met vriendelijke groet,?\s*$/i, "").trim();
      cleanedBody += `\n\nMet vriendelijke groet,\nTeun – CivicAi Solutions`;
    }
  }

  return { subject, body: cleanedBody };
}
// onderaan src/lib/openaiClient.ts

export async function generateLinkedInPost() {
  const sys =
    "You are a B2B LinkedIn content marketer for ContractGuard AI. You write short, punchy posts.";

  const prompt = `
Write ONE LinkedIn post about ContractGuard AI.

Audience: small business owners, freelancers, lawyers who deal with contracts.
Goal: awareness + curiosity, not hard selling.
Rules:
- Max 120 words
- No hashtags or emojis at the start, 1–3 at the end is OK
- Make it feel personal and human
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: sys },
      { role: "user", content: prompt },
    ],
  });

  return completion.choices[0].message.content || "";
}

export async function generateLinkedInDM() {
  const sys =
    "You are a B2B LinkedIn sales copywriter for ContractGuard AI. You write short, friendly DMs.";

  const prompt = `
Write ONE short LinkedIn DM to someone who regularly has to read contracts.

Rules:
- Max 90 words
- Friendly and low-pressure
- Mention ContractGuard AI as a way to scan contracts for risks and action points
- End with a soft question like "Would it be okay if I send you a quick demo link?"`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: sys },
      { role: "user", content: prompt },
    ],
  });

  return completion.choices[0].message.content || "";
}
