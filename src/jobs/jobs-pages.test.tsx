import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { expect, it, vi } from "vitest";

import { routes } from "../app/router";
import { AuthProvider } from "../auth/auth-provider";
import { JobsContext, JobsError, type JobsPort } from "./jobs-context";
import type { Job, Recommendation } from "./jobs-http";

const offer: Job = {
  opportunityId: "12345678-0000-4000-8000-000000000001",
  groupId: "12345678-0000-4000-8000-000000000002",
  title: "Example engineer",
  employer: "Example company",
  location: null,
  status: "active",
  sourceAccess: "full_text",
  version: 2,
  description: "Maintain example services.",
  source: {
    kind: "manual",
    reference: "https://example.invalid/job",
    capturedAt: "2026-11-20T08:00:00Z",
  },
  evidence: {
    statedFields: ["title"],
    inferredFields: [],
    unknownFields: ["workMode"],
  },
};

function open(path: string, overrides: Partial<JobsPort> = {}) {
  const jobs: JobsPort = {
    listJobs: (page) =>
      Promise.resolve({
        items: page === 1 ? [offer] : [],
        page,
        pageSize: 20,
        total: 21,
      }),
    listRecommendations: () => Promise.resolve([]),
    getJob: () => Promise.resolve(offer),
    getRecommendation: () => Promise.resolve(null),
    ...overrides,
  };
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AuthProvider
      sessionPort={{
        restore: () =>
          Promise.resolve({
            user: { subject: "example-owner", displayName: "Example Person" },
          }),
        beginSignIn: vi.fn(),
        completeSignIn: vi.fn(),
        signOut: vi.fn(),
        onSessionChanged: () => vi.fn(),
      }}
    >
      <JobsContext.Provider value={jobs}>
        <RouterProvider router={router} />
      </JobsContext.Provider>
    </AuthProvider>,
  );
}

it("loads catalog pagination and follows an owned immutable detail link", async () => {
  open("/app/jobs/catalog?page=invalid");
  await screen.findByRole("link", { name: offer.title });
  await userEvent.click(screen.getByRole("link", { name: "Next" }));
  expect(
    await screen.findByText("No opportunities on this page."),
  ).not.toBeNull();
  await userEvent.click(screen.getByRole("link", { name: "Previous" }));
  await userEvent.click(await screen.findByRole("link", { name: offer.title }));
  expect(
    await screen.findByRole("heading", { name: offer.title }),
  ).not.toBeNull();
  expect(screen.getByText("Verified full text")).not.toBeNull();
  expect(screen.getByText(offer.description ?? "")).not.toBeNull();
});

it.each([
  ["denied", "Access to this opportunity was denied."],
  ["notFound", "This opportunity could not be found."],
  ["unavailable", "Opportunities could not be loaded."],
] as const)(
  "renders a bounded %s state without offer data",
  async (kind, message) => {
    open(`/app/jobs/${offer.opportunityId}`, {
      getJob: () => Promise.reject(new JobsError(kind)),
    });
    expect((await screen.findByRole("alert")).textContent).toContain(message);
    expect(screen.queryByRole("heading", { name: offer.title })).toBeNull();
  },
);

const match: Recommendation = {
  groupId: offer.groupId,
  title: offer.title,
  employer: offer.employer,
  state: "inactive",
  reason: "hard_conflict",
  match: {
    opportunityVersionId: offer.opportunityId,
    sourceAccess: "full_text",
    score: 0,
    findings: [
      {
        requirementId: offer.groupId,
        statement: "Hold a synthetic certification.",
        status: "missing",
        factId: offer.opportunityId,
        minimumLevel: 2,
        confirmedLevel: 0,
        weight: 2,
        earnedWeight: 0,
      },
    ],
    hardConflicts: [offer.groupId],
    explanation: {
      assessedRequirements: 1,
      totalRequirements: 2,
      assessedWeight: 2,
      totalWeight: 3,
      earnedWeight: 0,
      uncertainty: "unconfirmed_profile_facts",
      scoreBounds: { minimum: 0, maximum: 33 },
    },
    limitation: "This score does not guarantee an interview or employment.",
  },
};

it("renders recommendations in API order and shows zero, uncertainty and a hard conflict", async () => {
  const external = {
    ...match,
    groupId: offer.opportunityId,
    title: "External opportunity",
    employer: null,
    match: {
      ...match.match,
      sourceAccess: "external_to_verify" as const,
      score: null,
    },
  };
  open("/app/jobs", {
    listRecommendations: () => Promise.resolve([match, external]),
    getRecommendation: () => Promise.resolve(match),
  });
  await screen.findByText("Score unavailable");
  expect(
    screen
      .getAllByRole("listitem")
      .map((item) => item.querySelector("a")?.textContent),
  ).toEqual([offer.title, external.title]);
  await userEvent.click(screen.getByRole("link", { name: offer.title }));
  expect(await screen.findByText("Hard eligibility conflict")).not.toBeNull();
  expect(screen.getByText("0% match")).not.toBeNull();
  expect(screen.getByText(/0–33%/)).not.toBeNull();
  expect(screen.getByText(match.match.limitation)).not.toBeNull();
});

it("shows no recommendation message for the empty personalized view", async () => {
  open("/app/jobs");
  expect(
    await screen.findByText("No recommendations on this page."),
  ).not.toBeNull();
});
