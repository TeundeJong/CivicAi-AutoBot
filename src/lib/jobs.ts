export type JobType =
  | "GENERATE_EMAIL"
  | "GENERATE_LINKEDIN_DM"
  | "GENERATE_LINKEDIN_POST"
  | "GENERATE_LAUNCH_COPY";

export type JobStatus = "pending" | "processing" | "done" | "failed";

export interface MarketingJobPayload {
  campaignName?: string;
  language?: "nl" | "en";
  channel?: "email" | "linkedin" | "launch";
  extraContext?: string;
}
