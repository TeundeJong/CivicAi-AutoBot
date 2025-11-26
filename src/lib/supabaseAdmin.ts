// src/lib/supabaseAdmin.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceKey) {
  console.warn("⚠️ Supabase env vars missen, check .env.local");
}

export const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

export type DbJobStatus = "pending" | "processing" | "done" | "failed";

export interface Lead {
  id: string;
  email: string;
  name: string | null;
  company: string | null;
}

export interface SenderAccount {
  id: string;
  email: string;
  display_name: string | null;
  warmup_start_date: string | null; // date
  is_active: boolean;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_pass: string | null;
  max_per_day?: number | null;
}

export interface MarketingJob {
  id: string;
  type: string;
  status: DbJobStatus;
  lead_id: string | null;
  payload: any;
  error: string | null;
  created_at: string;
  updated_at: string;
}
