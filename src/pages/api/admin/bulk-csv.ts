import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import Papa from "papaparse";

export const config = {
  api: {
    bodyParser: false, // belangrijk voor file upload!
  },
};

async function readFile(req: NextApiRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const csvText = await readFile(req);

    const parsed = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
    });

    const rows = parsed.data as any[];

    const leadsToInsert = rows
      .map((r) => {
        const email = r.Email || r.email || r["Email Address"];
        if (!email || !email.includes("@")) return null;

        return {
          email,
          name: `${r["First Name"] || ""} ${r["Last Name"] || ""}`.trim() || null,
          company: r.Company || null,
        };
      })
      .filter(Boolean);

    if (!leadsToInsert.length)
      return res.status(400).json({ error: "No leads found in CSV" });

    const { data: inserted, error } = await supabaseAdmin
      .from("leads")
      .insert(leadsToInsert)
      .select("id");

    if (error) throw error;

    let jobs = 0;
    for (const lead of inserted) {
      await supabaseAdmin.from("marketing_jobs").insert([
        {
          type: "GENERATE_EMAIL",
          status: "pending",
          lead_id: lead.id,
          payload: { language: "en", autoApprove: false },
        },
        {
          type: "GENERATE_LINKEDIN_DM",
          status: "pending",
          lead_id: lead.id,
          payload: { language: "en", autoApprove: false },
        },
      ]);
      jobs += 2;
    }

    return res.json({
      inserted: inserted.length,
      jobsCreated: jobs,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
