import { createContext } from "react";
import { z } from "zod";

import type { AccessTokenPort } from "../auth/session";

const uuid = z.uuid();
export const pinsSchema = z.object({
  recommendationId: uuid,
  evaluationId: uuid,
  groupId: uuid,
  opportunityVersionId: uuid,
  profileSnapshotId: uuid,
  criteriaVersionId: uuid,
});
const missingSchema = z.array(
  z.object({
    requirementId: uuid,
    statement: z.string(),
    status: z.enum(["partial", "missing", "unknown"]),
  }),
);
const evidenceSchema = z.object({
  pins: pinsSchema,
  missingRequirements: missingSchema,
});
const sha = z.string().regex(/^[0-9a-f]{64}$/);
const versionSchema = z.object({
  resumeId: uuid,
  version: z.number().int().positive(),
  recommendation: evidenceSchema,
  artifacts: z.array(
    z.object({ format: z.enum(["pdf", "docx"]), sha256: sha }),
  ),
});
const reviewSchema = z.object({
  version: versionSchema,
  current: z.boolean(),
  approval: z
    .object({ approvedAt: z.iso.datetime({ offset: true }) })
    .nullable(),
  eligibleForPackage: z.boolean(),
});
const failureSchema = z.object({
  code: z.string().optional(),
  missingRequirements: missingSchema.default([]),
});

export type Pins = z.infer<typeof pinsSchema>;
export type ResumeVersion = z.infer<typeof versionSchema>;
export type ResumeReview = z.infer<typeof reviewSchema>;
type Missing = z.infer<typeof missingSchema>;

export class ResumeError extends Error {
  constructor(
    readonly kind: string,
    readonly missing: Missing = [],
  ) {
    super(kind);
  }
}

export interface ResumePort {
  create(pins: Pins, key: string, signal: AbortSignal): Promise<ResumeVersion>;
  review(
    id: string,
    version: number,
    signal: AbortSignal,
  ): Promise<ResumeReview>;
  preview(id: string, version: number, signal: AbortSignal): Promise<Blob>;
  approve(
    id: string,
    version: number,
    digest: string,
    signal: AbortSignal,
  ): Promise<ResumeReview>;
}

export const ResumeContext = createContext<ResumePort | null>(null);

export function resumeUrl(version: ResumeVersion) {
  return `/app/resumes/${version.resumeId}/${String(version.version)}`;
}

function versionPath(id: string, version: number) {
  if (
    !uuid.safeParse(id).success ||
    !Number.isSafeInteger(version) ||
    version < 1
  )
    throw new ResumeError("invalid");
  return `/v1/resumes/${id}/versions/${String(version)}`;
}

export class HttpResumes implements ResumePort {
  constructor(
    private readonly base: string,
    private readonly tokens: AccessTokenPort,
    private readonly fetchPort: typeof fetch = globalThis.fetch.bind(
      globalThis,
    ),
  ) {}

  async create(pins: Pins, key: string, signal: AbortSignal) {
    const response = await this.request("/v1/recommendation-resumes", signal, {
      method: "POST",
      body: JSON.stringify(pins),
      headers: { "Idempotency-Key": key },
    });
    const version = await this.parse(response, versionSchema);
    const keys = Object.keys(pins) as (keyof Pins)[];
    if (
      version.resumeId !== pins.recommendationId ||
      keys.some((field) => version.recommendation.pins[field] !== pins[field])
    )
      throw new ResumeError("unavailable");
    return version;
  }

  review(id: string, version: number, signal: AbortSignal) {
    return this.readReview(id, version, "review", signal);
  }

  approve(id: string, version: number, digest: string, signal: AbortSignal) {
    return this.readReview(id, version, "approval", signal, {
      method: "POST",
      body: JSON.stringify({ approved: true, pdfSha256: digest }),
    });
  }

  async preview(id: string, version: number, signal: AbortSignal) {
    const response = await this.request(
      `${versionPath(id, version)}/artifacts/pdf`,
      signal,
      {
        headers: { Accept: "application/pdf" },
      },
    );
    if (response.headers.get("Content-Type") !== "application/pdf")
      throw new ResumeError("unavailable");
    return response.blob();
  }

  private async readReview(
    id: string,
    version: number,
    path: string,
    signal: AbortSignal,
    init?: RequestInit,
  ) {
    const response = await this.request(
      `${versionPath(id, version)}/${path}`,
      signal,
      init,
    );
    const review = await this.parse(response, reviewSchema);
    if (
      review.version.resumeId !== id.toLowerCase() ||
      review.version.version !== version
    )
      throw new ResumeError("unavailable");
    return review;
  }

  private async parse<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
    try {
      return schema.parse(await response.json());
    } catch {
      throw new ResumeError("unavailable");
    }
  }

  private async request(
    path: string,
    signal: AbortSignal,
    init: RequestInit = {},
  ) {
    const token = await this.tokens.getAccessToken();
    if (!token) throw new ResumeError("denied");
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (init.body !== undefined)
      headers.set("Content-Type", "application/json");
    let response: Response;
    try {
      response = await this.fetchPort(
        `${this.base.replace(/\/$/, "")}${path}`,
        {
          ...init,
          headers,
          signal,
          redirect: "error",
        },
      );
    } catch {
      throw new ResumeError("unavailable");
    }
    if (response.ok) return response;
    if (response.status === 401 || response.status === 403)
      throw new ResumeError("denied");
    if (response.status === 404) throw new ResumeError("notFound");
    if (response.status === 409 || response.status === 422) {
      const failure = await this.parse(response, failureSchema);
      throw new ResumeError(
        failure.code ?? "invalid",
        failure.missingRequirements,
      );
    }
    throw new ResumeError("unavailable");
  }
}
