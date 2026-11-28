import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

import { routes } from "../app/router";
import { AuthProvider } from "../auth/auth-provider";
import { JobsContext, type JobsPort } from "../jobs/jobs-context";
import type { Job, Recommendation } from "../jobs/jobs-http";
import { HttpResumes, ResumeContext } from "./resume-client";

const pins = {
  recommendationId: "12345678-0000-4000-8000-000000000001",
  evaluationId: "12345678-0000-4000-8000-000000000002",
  groupId: "12345678-0000-4000-8000-000000000003",
  opportunityVersionId: "12345678-0000-4000-8000-000000000004",
  profileSnapshotId: "12345678-0000-4000-8000-000000000005",
  criteriaVersionId: "12345678-0000-4000-8000-000000000006",
};
const requirement = {
  requirementId: "12345678-0000-4000-8000-000000000007",
  statement: "Confirm additional framework experience.",
  status: "partial",
};
const digest = "d".repeat(64);
const version = {
  resumeId: pins.recommendationId,
  version: 1,
  recommendation: { pins, missingRequirements: [requirement] },
  artifacts: [{ format: "pdf", sha256: digest }],
};
const currentReview = {
  version,
  current: true,
  approval: null,
  eligibleForPackage: false,
};
const approved = { approvedAt: "2026-11-27T08:30:00Z" };
const base = "https://resume.example.invalid/v1";
const versionPath = `${base}/resumes/${version.resumeId}/versions/1`;
const reviewRoute = `/app/resumes/${version.resumeId}/1`;
const offer: Job = {
  opportunityId: pins.opportunityVersionId,
  groupId: pins.groupId,
  title: "Synthetic engineer",
  employer: null,
  location: null,
  status: "active",
  sourceAccess: "full_text",
  version: 1,
  description: "Maintain synthetic services.",
  source: {
    kind: "manual",
    reference: "https://example.invalid/job",
    capturedAt: "2026-11-20T08:00:00Z",
  },
  evidence: { statedFields: ["title"], inferredFields: [], unknownFields: [] },
};
const recommendation: Recommendation = {
  ...pins,
  title: offer.title,
  employer: offer.employer,
  state: "active",
  reason: "qualified",
  match: {
    opportunityVersionId: pins.opportunityVersionId,
    profileSnapshotId: pins.profileSnapshotId,
    sourceAccess: "full_text",
    score: 90,
    findings: [],
    hardConflicts: [],
    explanation: {
      assessedRequirements: 1,
      totalRequirements: 1,
      assessedWeight: 1,
      totalWeight: 1,
      earnedWeight: 1,
      uncertainty: null,
      scoreBounds: null,
    },
    limitation: "The score is an estimate.",
  },
};

function open(path: string, fetchPort: typeof fetch, match = recommendation) {
  const jobs: JobsPort = {
    listJobs: () =>
      Promise.resolve({ items: [], page: 1, pageSize: 20, total: 0 }),
    listRecommendations: () => Promise.resolve([match]),
    getJob: () => Promise.resolve(offer),
    getRecommendation: () => Promise.resolve(match),
  };
  const client = new HttpResumes(
    "https://resume.example.invalid/",
    { getAccessToken: () => Promise.resolve("synthetic-token") },
    fetchPort,
  );
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const revoke = vi.fn();
  vi.stubGlobal(
    "URL",
    class extends URL {
      static override createObjectURL() {
        return "blob:synthetic-resume";
      }
      static override revokeObjectURL = revoke;
    },
  );
  return {
    revoke,
    ...render(
      <AuthProvider
        sessionPort={{
          restore: () =>
            Promise.resolve({
              user: { subject: "owner", displayName: "Example owner" },
            }),
          beginSignIn: vi.fn(),
          completeSignIn: vi.fn(),
          signOut: vi.fn(),
          onSessionChanged: () => vi.fn(),
        }}
      >
        <JobsContext.Provider value={jobs}>
          <ResumeContext.Provider value={client}>
            <RouterProvider router={router} />
          </ResumeContext.Provider>
        </JobsContext.Provider>
      </AuthProvider>,
    ),
  };
}

function pdf() {
  return new Response("%PDF-1.4", {
    headers: { "Content-Type": "application/pdf" },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("creates a pinned draft from recommendations and approves its protected PDF", async () => {
  const http = vi.fn<typeof fetch>((url) => {
    switch (url) {
      case `${base}/recommendation-resumes`:
        return Promise.resolve(Response.json(version, { status: 201 }));
      case `${versionPath}/review`:
        return Promise.resolve(Response.json(currentReview));
      case `${versionPath}/artifacts/pdf`:
        return Promise.resolve(pdf());
      case `${versionPath}/approval`:
        return Promise.resolve(
          Response.json({
            ...currentReview,
            approval: approved,
            eligibleForPackage: true,
          }),
        );
      default:
        return Promise.reject(new Error("Unexpected request"));
    }
  });
  const { revoke, unmount } = open("/app/jobs", http);
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole(
      "button",
      { name: "Create resume" },
      { timeout: 5000 },
    ),
  );

  expect(await screen.findByTitle("Resume PDF preview")).toBeTruthy();
  expect(screen.getByText(requirement.statement)).toBeTruthy();
  const approve = screen.getByRole<HTMLButtonElement>("button", {
    name: "Approve this version",
  });
  expect(approve.disabled).toBe(true);
  await user.click(
    screen.getByRole("checkbox", { name: /I reviewed this PDF/ }),
  );
  await user.click(approve);
  expect(
    await screen.findByText("This version is approved for a package."),
  ).toBeTruthy();

  const create = http.mock.calls.find(
    ([url]) => url === `${base}/recommendation-resumes`,
  )?.[1];
  expect(create?.body).toBe(JSON.stringify(pins));
  expect(new Headers(create?.headers).get("Idempotency-Key")).toBe(
    pins.evaluationId,
  );
  const preview = http.mock.calls.find(
    ([url]) => url === `${versionPath}/artifacts/pdf`,
  )?.[1];
  expect(new Headers(preview?.headers).get("Authorization")).toBe(
    "Bearer synthetic-token",
  );
  expect(preview?.redirect).toBe("error");
  const approval = http.mock.calls.find(
    ([url]) => url === `${versionPath}/approval`,
  )?.[1];
  expect(approval?.body).toBe(
    JSON.stringify({ approved: true, pdfSha256: digest }),
  );
  unmount();
  expect(revoke).toHaveBeenCalledWith("blob:synthetic-resume");
});

it("shows the creation action on the matching detail", async () => {
  const http = vi.fn<typeof fetch>(() =>
    Promise.resolve(new Response(null, { status: 503 })),
  );
  open(`/app/jobs/${offer.opportunityId}`, http);
  await userEvent.click(
    await screen.findByRole("button", { name: "Create resume" }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain(
    "You can retry.",
  );
});

it("guides the user to verify a link-only offer before creating a resume", async () => {
  const http = vi.fn<typeof fetch>();
  open("/app/jobs", http, {
    ...recommendation,
    state: "unassessed",
    reason: "external_to_verify",
    match: {
      ...recommendation.match,
      sourceAccess: "external_to_verify",
      score: null,
    },
  });
  expect(
    await screen.findByText(/Verify or manually import the full offer/),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Create resume" })).toBeNull();
  expect(http).not.toHaveBeenCalled();
});

it.each([
  [403, {}, "Resume access was denied."],
  [404, {}, "This resume or recommendation is unavailable to you."],
  [
    422,
    { code: "missing_facts", missingRequirements: [requirement] },
    requirement.statement,
  ],
] as const)(
  "shows useful feedback when draft creation returns %s",
  async (status, problem, message) => {
    const http = vi.fn<typeof fetch>(() =>
      Promise.resolve(Response.json(problem, { status })),
    );
    open("/app/jobs", http);
    await userEvent.click(
      await screen.findByRole("button", { name: "Create resume" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(message);
  },
);

it("keeps the PDF and historical approval visible after source facts change", async () => {
  const http = vi.fn<typeof fetch>((url) =>
    Promise.resolve(
      url === `${versionPath}/review`
        ? Response.json({
            ...currentReview,
            current: false,
            approval: approved,
          })
        : pdf(),
    ),
  );
  open(reviewRoute, http);
  expect(
    await screen.findByText("This version has a historical approval."),
  ).toBeTruthy();
  expect(screen.getByTitle("Resume PDF preview")).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: "Refresh recommendations" })
      .getAttribute("href"),
  ).toBe("/app/jobs");
  expect(
    screen.queryByRole("button", { name: "Approve this version" }),
  ).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Regenerate resume" }),
  ).toBeNull();
});

it("regenerates a new version and requires a separate approval", async () => {
  const next = { ...version, version: 2 };
  const http = vi.fn<typeof fetch>((url) => {
    if (url === `${base}/recommendation-resumes`)
      return Promise.resolve(Response.json(next, { status: 201 }));
    if (url === `${versionPath}/review`)
      return Promise.resolve(
        Response.json({
          ...currentReview,
          approval: approved,
          eligibleForPackage: true,
        }),
      );
    if (url === versionPath.replace(/1$/, "2") + "/review")
      return Promise.resolve(
        Response.json({ ...currentReview, version: next }),
      );
    return Promise.resolve(pdf());
  });
  open(reviewRoute, http);
  await userEvent.click(
    await screen.findByRole("button", { name: "Regenerate resume" }),
  );
  expect(
    await screen.findByRole("heading", { name: "Review resume version 2" }),
  ).toBeTruthy();
  expect(
    screen.getByRole<HTMLButtonElement>("button", {
      name: "Approve this version",
    }).disabled,
  ).toBe(true);
  const create = http.mock.calls.find(
    ([url]) => url === `${base}/recommendation-resumes`,
  )?.[1];
  const key = new Headers(create?.headers).get("Idempotency-Key");
  expect(key).toBeTruthy();
  expect(key).not.toBe(pins.evaluationId);
});
