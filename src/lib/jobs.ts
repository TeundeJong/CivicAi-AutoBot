// src/lib/jobs.ts
import { supabaseAdmin, MarketingJob, SenderAccount } from "./supabaseAdmin";

// Types voor de marketing_jobs entries
export type JobType = "GENERATE_EMAIL";

export interface EnqueueJobPayload {
  language: "nl" | "en";
  autoApprove: boolean;
  extraContext?: string;
}

// Nieuwe job toevoegen
export async function enqueueJob(params: {
  type: JobType;
  leadId: string;
  payload: EnqueueJobPayload;
}) {
  const { type, leadId, payload } = params;

  const { data, error } = await supabaseAdmin
    .from("marketing_jobs")
    .insert({
      type,
      status: "pending",
      lead_id: leadId,
      payload,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as MarketingJob;
}

// Alle pending jobs ophalen
export async function getPendingJobs(limit: number): Promise<MarketingJob[]> {
  const { data, error } = await supabaseAdmin
    .from("marketing_jobs")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data || []) as MarketingJob[];
}

export async function markJobStatus(
  id: string,
  status: "processing" | "done" | "failed",
  errorMsg?: string
) {
  const { error } = await supabaseAdmin
    .from("marketing_jobs")
    .update({
      status,
      error: errorMsg || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw error;
}

// Sender accounts ophalen + warmup / limiet berekenen

function calcWarmupLimit(
  account: SenderAccount,
  today = new Date()
): number {
  const max = account.max_per_day || 50;
  if (!account.warmup_start_date) return max;

  const start = new Date(account.warmup_start_date);
  const diffDays = Math.floor(
    (today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays <= 0) return 5;
  if (diffDays === 1) return 10;
  if (diffDays === 2) return 20;
  if (diffDays === 3) return 30;
  if (diffDays === 4) return 40;
  if (diffDays === 5) return max;
  return max;
}

export async function pickSenderForToday() {
  const { data: accounts, error } = await supabaseAdmin
    .from("sender_accounts")
    .select("*")
    .eq("is_active", true);

  if (error) throw error;
  const list = (accounts || []) as SenderAccount[];
  if (!list.length) throw new Error("Geen actieve sender_accounts gevonden");

  const today = new Date();
  const todayIso = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  ).toISOString();

  const perAccount: {
    account: SenderAccount;
    used: number;
    limit: number;
  }[] = [];

  for (const acc of list) {
    const limit = calcWarmupLimit(acc, today);

    const { data: sent, error: sentErr } = await supabaseAdmin
      .from("email_outbox")
      .select("id", { count: "exact", head: true })
      .eq("sender_id", acc.id)
      .gte("created_at", todayIso);

    if (sentErr) throw sentErr;
    const used = sent?.length ?? 0;

    perAccount.push({ account: acc, used, limit });
  }

  // kies account met meeste ruimte over
  const available = perAccount
    .filter((a) => a.used < a.limit)
    .sort((a, b) => a.used - b.used);

  if (!available.length) {
    return null; // niets meer versturen vandaag
  }

  return available[0];
}
