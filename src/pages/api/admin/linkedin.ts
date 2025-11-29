// src/pages/api/admin/linkedin.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

type LinkedInStatus = "draft" | "approved" | "used" | "declined" | "all";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const type = (req.query.type as string) || "post"; // "post" | "dm"
    const status = (req.query.status as LinkedInStatus) || "draft";

    let query = supabaseAdmin
      .from("linkedin_content")
      .select("*")
      .eq("type", type)
      .order("created_at", { ascending: false })
      .limit(2000);

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      console.error("linkedin_content GET error", error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ items: data ?? [] });
  }

  if (req.method === "POST") {
    // Status updaten (optioneel, maar handig als je later approve/decline wilt doen)
    const { id, status } = req.body as { id?: string; status?: LinkedInStatus };

    if (!id || !status || status === "all") {
      return res.status(400).json({ error: "id en geldige status zijn verplicht" });
    }

    const { error } = await supabaseAdmin
      .from("linkedin_content")
      .update({ status })
      .eq("id", id);

    if (error) {
      console.error("linkedin_content POST error", error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET,POST");
  return res.status(405).end("Method Not Allowed");
}
