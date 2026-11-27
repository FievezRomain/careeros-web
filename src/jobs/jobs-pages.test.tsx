import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { expect, it, vi } from "vitest";

import { routes } from "../app/router";
import { AuthProvider } from "../auth/auth-provider";
import { JobsContext, JobsError, type JobsPort } from "./jobs-context";
import type { Job } from "./jobs-http";

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
