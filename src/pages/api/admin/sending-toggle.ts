import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "GET") {
    // huidige status ophalen
    try {
      const { data, error } = await supabaseAdmin
        .from("autobot_settings")
        .select("sending_enabled")
        .eq("id", 1)
        .limit(1);

      if (error) {
        console.error("sending-toggle GET error:", error);
        // als er iets misgaat, ga ik ervan uit dat sending aan staat
        return res.status(200).json({ enabled: true });
      }

      const enabled = data && data.length > 0
        ? !!data[0].sending_enabled
        : true;

      return res.status(200).json({ enabled });
    } catch (err: any) {
      console.error("sending-toggle GET fatal:", err);
      return res.status(500).json({ error: err.message || "Server error" });
    }
  }

  if (req.method === "POST") {
    // aan/uit zetten
    try {
      const body = req.body || {};
      let newValue: boolean;

      if (typeof body.enabled === "boolean") {
        // expliciete waarde
        newValue = body.enabled;
      } else {
        // toggle huidige waarde
        const { data, error } = await supabaseAdmin
          .from("autobot_settings")
          .select("sending_enabled")
          .eq("id", 1)
          .limit(1);

        if (error) {
          console.error("sending-toggle POST read error:", error);
          // als we niet kunnen lezen, ga ik uit van true en toggle die
          const current = true;
          newValue = !current;
        } else {
          const current =
            data && data.length > 0
              ? !!data[0].sending_enabled
              : true;
          newValue = !current;
        }
      }

      const { data: upserted, error: upsertErr } = await supabaseAdmin
        .from("autobot_settings")
        .upsert(
          {
            id: 1,
            sending_enabled: newValue,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        )
        .select("sending_enabled")
        .limit(1);

      if (upsertErr) {
        console.error("sending-toggle POST upsert error:", upsertErr);
        return res.status(500).json({ error: upsertErr.message });
      }

      const enabled =
        upserted && upserted.length > 0
          ? !!upserted[0].sending_enabled
          : newValue;

      return res.status(200).json({ enabled });
    } catch (err: any) {
      console.error("sending-toggle POST fatal:", err);
      return res.status(500).json({ error: err.message || "Server error" });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
