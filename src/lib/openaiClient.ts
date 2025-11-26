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
- Eindig met een simpele call-to-action (bijv. 'Zal ik je een korte demo sturen?').`
      : `Write a short first outreach email about ContractGuard AI.

Name: ${leadName || "-"}
Company: ${company || "-"}
Extra context: ${extraContext || "-"}

Rules:
- Max 140 words
- Subject: 1 strong, clear line
- Not pushy, but clear value
- End with a simple call-to-action (e.g. "Would you like a short demo?").`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: sys },
      { role: "user", content: prompt },
    ],
  });

  const text = completion.choices[0].message.content || "";

  const [firstLine, ...rest] = text.split("\n").filter(Boolean);
  let subject = firstLine.replace(/^onderwerp[:\-]\s*/i, "").trim();
  let body = rest.join("\n").trim();

  if (!subject || !body) {
    // fallback: hele tekst als body
    subject = language === "nl" ? "ContractGuard AI – contracten sneller en veiliger" : "ContractGuard AI – faster, safer contracts";
    body = text;
  }

  return { subject, body };
}
