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
- Eindig met een simpele call-to-action (bijv. 'Zal ik je een korte demo sturen?').
- Eindig altijd met:
  "Met vriendelijke groet,
   Teun – CivicAi Solutions"`
      : `Write a short first outreach email about ContractGuard AI.

Name: ${leadName || "-"}
Company: ${company || "-"}
Extra context: ${extraContext || "-"}

Rules:
- Max 140 words
- Subject: 1 strong, clear line
- Not pushy, but clear value
- End with a simple call-to-action (e.g. "Would you like a short demo?").
- Always end with:
  "Best regards,
   Teun – CivicAi Solutions"`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: sys },
      { role: "user", content: prompt },
    ],
  });

  // ---- Post-processing: signature & placeholders fixen ----
  let text = completion.choices[0]?.message?.content || "";

  // Normaliseer line endings
  text = text.replace(/\r\n/g, "\n");

  // Vervang (your name) / your name → jouw echte naam + bedrijf
  text = text
    .replace(/\(your ?name\)/gi, "Teun – CivicAi Solutions")
    .replace(/your name/gi, "Teun – CivicAi Solutions");

  const signature =
    language === "nl"
      ? `Met vriendelijke groet,\nTeun – CivicAi Solutions`
      : `Best regards,\nTeun – CivicAi Solutions`;

  const lower = text.toLowerCase();

  // Als de juiste signature er nog niet in staat, voeg hem toe
  if (
    !lower.includes("teun – civicai solutions") &&
    !lower.includes("teun - civicai solutions")
  ) {
    text += `\n\n${signature}`;
  }

  // ---- Subject + body eruit halen zoals je al deed ----
  const lines = text.split("\n").filter(Boolean);
  const [firstLine, ...rest] = lines;
  let subject = firstLine.replace(/^onderwerp[:\-]\s*/i, "").trim();
  let body = rest.join("\n").trim();

  if (!subject || !body) {
    // fallback: hele tekst als body
    subject =
      language === "nl"
        ? "ContractGuard AI – contracten sneller en veiliger"
        : "ContractGuard AI – faster, safer contracts";
    body = text;
  }

  return { subject, body };
}
