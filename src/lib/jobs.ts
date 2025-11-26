export type JobType =
  | "GENERATE_EMAIL"
  | "GENERATE_LINKEDIN_DM";

export interface MarketingJobPayload {
  language?: "nl" | "en";
  campaignName?: string;
  subject?: string;
  extraContext?: string;
  autoApprove?: boolean;
}

export interface MarketingJob {
  id: string;
  type: JobType;
  status: "pending" | "processing" | "done" | "failed";
  payload: MarketingJobPayload | null;
  lead_id: string | null;
  attempts: number;
  created_at: string;
  updated_at: string | null;
}
