import { z } from "zod";

import type { AccessTokenPort } from "../auth/session";
import { JobsError, type JobsPort } from "./jobs-context";

const uuid = z.uuid();
const sourceAccess = z.enum(["full_text", "external_to_verify"]);
const score = z.number().int().min(0).max(100);
const finding = z.object({
  requirementId: uuid,
  statement: z.string(),
  status: z.enum(["satisfied", "partial", "missing", "unknown"]),
  factId: uuid.nullable(),
  minimumLevel: z.number().int().min(0).max(5),
  confirmedLevel: z.number().int().min(0).max(5).nullable(),
  weight: z.union([z.literal(1), z.literal(2)]),
  earnedWeight: z.number().min(0).max(2).nullable(),
});
const explanation = z.object({
  assessedRequirements: z.number().int().min(0).max(100),
  totalRequirements: z.number().int().min(0).max(100),
  assessedWeight: z.number().int().min(0).max(200),
  totalWeight: z.number().int().min(0).max(200),
  earnedWeight: z.number().min(0).max(200),
  uncertainty: z
    .enum([
      "unconfirmed_profile_facts",
      "no_verified_requirements",
      "external_to_verify",
    ])
    .nullable(),
  scoreBounds: z.object({ minimum: score, maximum: score }).nullable(),
});
const matches = z.object({
  score,
  sourceAccess,
  opportunityVersionId: uuid,
  profileSnapshotId: uuid.optional(),
});
const recommendationSummary = z.object({
  groupId: uuid,
  recommendationId: uuid.optional(),
  evaluationId: uuid.optional(),
  criteriaVersionId: uuid.optional(),
  title: z.string().min(1),
  employer: z.string().nullable(),
  state: z.enum(["active", "inactive", "unassessed"]),
  match: matches.extend({ score: score.nullable() }),
});
const recommendation = recommendationSummary.extend({
  reason: z.enum([
    "qualified",
    "paused",
    "ignored",
    "expired",
    "applied",
    "not_recent",
    "excluded",
    "criteria_mismatch",
    "criteria_unknown",
    "hard_conflict",
    "insufficient_evidence",
    "external_to_verify",
    "below_threshold",
  ]),
  match: recommendationSummary.shape.match.extend({
    findings: z.array(finding).max(100),
    hardConflicts: z.array(uuid).max(100),
    explanation,
    limitation: z.string().min(1),
  }),
});
const jobSummary = z.object({
  opportunityId: uuid,
  title: z.string().min(1),
  employer: z.string().nullable(),
  location: z.string().nullable(),
  sourceAccess,
  status: z.enum(["active", "saved", "ignored", "expired", "applied"]),
});
const source = z.object({ reference: z.string().min(1) });
const job = jobSummary.extend({
  groupId: uuid,
  description: z.string().nullable(),
  version: z.number().int().positive(),
  source: z.discriminatedUnion("kind", [
    source.extend({
      kind: z.literal("manual"),
      capturedAt: z.iso.datetime({ offset: true }),
    }),
    source.extend({
      kind: z.enum(["greenhouse", "open_web"]),
      observedAt: z.iso.datetime({ offset: true }),
    }),
  ]),
  evidence: z.object({
    statedFields: z.array(z.string()),
    inferredFields: z.array(z.string()),
    unknownFields: z.array(z.string()),
  }),
});
const jobPage = z.object({
  items: z.array(jobSummary),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export type Job = z.infer<typeof job>;
export type JobSummary = z.infer<typeof jobSummary>;
export type JobPage = z.infer<typeof jobPage>;
export type Recommendation = z.infer<typeof recommendation>;
export type RecommendationSummary = z.infer<typeof recommendationSummary>;

export const recommendationPageSize = 20;

export class HttpJobs implements JobsPort {
  constructor(
    private readonly jobBaseUrl: string,
    private readonly matchingBaseUrl: string,
    private readonly tokens: AccessTokenPort,
    private readonly fetchPort: typeof fetch = globalThis.fetch.bind(
      globalThis,
    ),
  ) {}

  async listRecommendations(offset: number, signal: AbortSignal) {
    const { items } = await this.read(
      this.matchingBaseUrl,
      `/v1/recommendations?limit=${String(recommendationPageSize)}&offset=${String(offset)}`,
      z.object({ items: z.array(recommendationSummary) }),
      signal,
    );
    return items;
  }

  listJobs(page: number, signal: AbortSignal) {
    return this.read(
      this.jobBaseUrl,
      `/v1/jobs?page=${String(page)}&pageSize=20`,
      jobPage,
      signal,
    );
  }

  async getJob(id: string, signal: AbortSignal) {
    if (!uuid.safeParse(id).success) throw new JobsError("notFound");
    const result = await this.read(
      this.jobBaseUrl,
      `/v1/jobs/${id}`,
      job,
      signal,
    );
    if (result.opportunityId !== id.toLowerCase())
      throw new JobsError("unavailable");
    return result;
  }

  async getRecommendation(offer: Job, signal: AbortSignal) {
    try {
      const match = await this.read(
        this.matchingBaseUrl,
        `/v1/recommendations/${offer.groupId}`,
        recommendation,
        signal,
      );
      if (match.groupId !== offer.groupId) throw new JobsError("unavailable");
      return match.match.opportunityVersionId === offer.opportunityId &&
        match.match.sourceAccess === offer.sourceAccess
        ? match
        : null;
    } catch (error) {
      if (error instanceof JobsError && error.kind === "notFound") return null;
      throw error;
    }
  }

  private async read<T>(
    base: string,
    path: string,
    schema: z.ZodType<T>,
    signal: AbortSignal,
  ) {
    const token = await this.tokens.getAccessToken();
    if (!token) throw new JobsError("denied");
    let data: unknown;
    try {
      const response = await this.fetchPort(
        `${base.replace(/\/$/, "")}${path}`,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
          redirect: "error",
          signal,
        },
      );
      if (response.status === 401 || response.status === 403)
        throw new JobsError("denied");
      if (response.status === 404) throw new JobsError("notFound");
      if (!response.ok) throw new JobsError("unavailable");
      data = await response.json();
    } catch (error) {
      if (error instanceof JobsError) throw error;
      throw new JobsError("unavailable");
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success) throw new JobsError("unavailable");
    return parsed.data;
  }
}
