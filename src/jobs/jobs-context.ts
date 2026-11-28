import { createContext, useContext } from "react";
import type {
  Job,
  JobPage,
  Recommendation,
  RecommendationSummary,
} from "./jobs-http";

export class JobsError extends Error {
  constructor(readonly kind: "denied" | "notFound" | "unavailable") {
    super(kind);
  }
}

export interface JobsPort {
  listRecommendations(
    offset: number,
    signal: AbortSignal,
  ): Promise<RecommendationSummary[]>;
  listJobs(page: number, signal: AbortSignal): Promise<JobPage>;
  getJob(id: string, signal: AbortSignal): Promise<Job>;
  getRecommendation(
    job: Job,
    signal: AbortSignal,
  ): Promise<Recommendation | null>;
}

export const JobsContext = createContext<JobsPort | null>(null);

export function useJobs(): JobsPort {
  const jobs = useContext(JobsContext);
  if (!jobs) throw new Error("Jobs context is required.");
  return jobs;
}
