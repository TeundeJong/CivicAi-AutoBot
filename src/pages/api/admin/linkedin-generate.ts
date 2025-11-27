// src/pages/api/admin/linkedin-generate.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import {
  generateLinkedInPost,
  generateLinkedInDM,
} from "../../../lib/openaiClient";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { type, count } = req.body || {};
    if (type !== "post" && type !== "dm") {
      return res.status(400).json({ error: "Invalid type" });
    }

    const n = Number(count || 10);
    const total = Number.isFinite(n) && n > 0 ? Math.min(n, 50) : 10;

    const items: { type: "post" | "dm"; status: string; content: string }[] =
      [];

    for (let i = 0; i < total; i++) {
      if (type === "post") {
        const content = await generateLinkedInPost();
        items.push({ type: "post", status: "draft", content });
      } else {
        const content = await generateLinkedInDM();
        items.push({ type: "dm", status: "draft", content });
      }
    }

    if (!items.length) {
      return res.status(400).json({ error: "Nothing generated" });
    }

    const { error } = await supabaseAdmin
      .from("linkedin_content")
      .insert(items);

    if (error) throw error;

    return res.status(200).json({ inserted: items.length });
  } catch (err: any) {
    console.error("linkedin-generate error", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
