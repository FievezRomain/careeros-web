import { describe, expect, it, vi } from "vitest";
import { HttpJobs, type Job } from "./jobs-http";

const id = "12345678-0000-4000-8000-000000000001";
const groupId = "12345678-0000-4000-8000-000000000002";
const signal = new AbortController().signal;
const job: Job = {
  opportunityId: id,
  groupId,
  title: "Example job",
  employer: null,
  location: null,
  status: "active",
  sourceAccess: "external_to_verify",
  version: 1,
  description: null,
  source: {
    kind: "open_web",
    reference: "https://jobs.example.invalid/one",
    observedAt: "2026-11-20T08:00:00Z",
  },
  evidence: {
    statedFields: ["title"],
    inferredFields: [],
    unknownFields: ["employer"],
  },
};

function adapter(
  fetchPort: typeof fetch,
  token: string | null = "example-token",
) {
  return new HttpJobs(
    "/api/jobs/",
    "/api/matching",
    { getAccessToken: () => Promise.resolve(token) },
    fetchPort,
  );
}

describe("jobs HTTP contracts", () => {
  it("validates owned reads with the injected token and service-specific pagination", async () => {
    const fetchPort = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ items: [job], total: 1, page: 2, pageSize: 20 }),
      )
      .mockResolvedValueOnce(Response.json({ items: [] }))
      .mockResolvedValueOnce(Response.json(job))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    const jobs = adapter(fetchPort);
    expect((await jobs.listJobs(2, signal)).items[0]?.title).toBe(job.title);
    expect(await jobs.listRecommendations(20, signal)).toEqual([]);
    expect(await jobs.getJob(id, signal)).toEqual(job);
    expect(await jobs.getRecommendation(job, signal)).toBeNull();
    expect(fetchPort.mock.calls.map(([url]) => url)).toEqual([
      "/api/jobs/v1/jobs?page=2&pageSize=20",
      "/api/matching/v1/recommendations?limit=20&offset=20",
      `/api/jobs/v1/jobs/${id}`,
      `/api/matching/v1/recommendations/${groupId}`,
    ]);
    expect(fetchPort.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: "Bearer example-token" },
      redirect: "error",
      signal,
    });
  });

  it("refuses an absent credential or malformed identifier before transport", async () => {
    const fetchPort = vi.fn<typeof fetch>();
    await expect(
      adapter(fetchPort, null).listJobs(1, signal),
    ).rejects.toMatchObject({ kind: "denied" });
    await expect(
      adapter(fetchPort).getJob("invalid", signal),
    ).rejects.toMatchObject({ kind: "notFound" });
    expect(fetchPort).not.toHaveBeenCalled();
  });

  it.each([401, 403, 404, 500])(
    "maps HTTP %s without reading response data",
    async (status) => {
      const response = Response.json(
        { title: "Private provider error" },
        { status },
      );
      const json = vi.spyOn(response, "json");
      const jobs = adapter(vi.fn<typeof fetch>().mockResolvedValue(response));
      const kind =
        status === 404 ? "notFound" : status === 500 ? "unavailable" : "denied";
      await expect(jobs.getJob(id, signal)).rejects.toMatchObject({ kind });
      expect(json).not.toHaveBeenCalled();
    },
  );

  it("rejects malformed payloads, an incorrect identity and transport failures", async () => {
    const fetchPort = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ items: [{ ...job, title: 42 }] }))
      .mockResolvedValueOnce(Response.json({ ...job, opportunityId: groupId }))
      .mockRejectedValueOnce(new Error("network failure"));
    const jobs = adapter(fetchPort);
    await expect(jobs.listJobs(1, signal)).rejects.toMatchObject({
      kind: "unavailable",
    });
    await expect(jobs.getJob(id, signal)).rejects.toMatchObject({
      kind: "unavailable",
    });
    await expect(jobs.getRecommendation(job, signal)).rejects.toMatchObject({
      kind: "unavailable",
    });
  });
});
