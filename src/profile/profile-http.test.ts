import { describe, expect, it, vi } from "vitest";

import type { AccessTokenPort } from "../auth/session";
import { HttpProfile } from "./profile-http";
import {
  ProfileAccessDeniedError,
  ProfileUnavailableError,
  ProfileValidationError,
} from "./profile-port";

const ITEM = {
  kind: "experience",
  itemId: "00000000-0000-4000-8000-000000000001",
  title: "Platform Engineer",
  employer: "Example Labs",
  startDate: "2024-01-01",
  current: true,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  provenance: {
    origin: "directEntry",
    recordedAt: "2026-01-01T00:00:00Z",
  },
  validationStatus: "userConfirmed",
} as const;

const SEARCH = {
  criteriaVersionId: "00000000-0000-4000-8000-000000000010",
  version: 1,
  state: "active",
  criteria: {
    targetRoles: ["Backend Engineer"],
    locations: ["Paris"],
    remotePolicy: "hybrid",
    contractTypes: ["CDI"],
    exclusions: [],
    minimumScore: 75,
  },
  schedule: {
    timezone: "Europe/Paris",
    windowStart: "08:00",
    windowEnd: "10:00",
  },
  searchSignature: {
    signatureId: "a".repeat(64),
    targetRoles: ["backend engineer"],
    locations: ["paris"],
    remotePolicy: "hybrid",
    contractTypes: ["cdi"],
    exclusions: [],
  },
  createdAt: "2026-01-01T00:00:00Z",
} as const;

const SEARCH_INPUT = {
  targetRoles: [...SEARCH.criteria.targetRoles],
  locations: [...SEARCH.criteria.locations],
  remotePolicy: SEARCH.criteria.remotePolicy,
  contractTypes: [...SEARCH.criteria.contractTypes],
  exclusions: [...SEARCH.criteria.exclusions],
  minimumScore: SEARCH.criteria.minimumScore,
  schedule: { ...SEARCH.schedule },
};

function tokens(value: string | null): AccessTokenPort {
  return { getAccessToken: () => Promise.resolve(value) };
}

describe("HttpProfile", () => {
  it("authorizes, validates and returns owned profile items", async () => {
    let requestUrl: RequestInfo | URL | undefined;
    let requestInit: RequestInit | undefined;
    const fetchPort = (input: RequestInfo | URL, init?: RequestInit) => {
      requestUrl = input;
      requestInit = init;
      return Promise.resolve(
        new Response(JSON.stringify({ items: [ITEM], page: {} }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    };
    const profile = new HttpProfile(
      "https://profile.example.invalid/",
      tokens("synthetic-access-token"),
      fetchPort,
    );

    await expect(profile.list()).resolves.toEqual([ITEM]);
    expect(requestUrl).toBe("https://profile.example.invalid/v1/profile/items");
    expect(new Headers(requestInit?.headers).get("Authorization")).toBe(
      "Bearer synthetic-access-token",
    );
  });

  it("maps authorization and validation failures without exposing payloads", async () => {
    const denied = new HttpProfile(
      "https://profile.example.invalid",
      tokens("synthetic-token"),
      () =>
        Promise.resolve(
          new Response("sensitive provider payload", { status: 403 }),
        ),
    );
    await expect(denied.list()).rejects.toThrow(ProfileAccessDeniedError);

    const invalid = new HttpProfile(
      "https://profile.example.invalid",
      tokens("synthetic-token"),
      () =>
        Promise.resolve(
          new Response("private validation detail", { status: 422 }),
        ),
    );
    await expect(
      invalid.save({
        kind: "skill",
        name: "Python",
        level: "advanced",
      }),
    ).rejects.toThrow(ProfileValidationError);

    await expect(
      new HttpProfile(
        "https://profile.example.invalid",
        tokens(null),
        vi.fn(),
      ).list(),
    ).rejects.toThrow(ProfileAccessDeniedError);
  });

  it("uses the versioned create and replace operations", async () => {
    const requests: { url: string; method: string | undefined }[] = [];
    const profile = new HttpProfile(
      "https://profile.example.invalid",
      tokens("synthetic-token"),
      (input, init) => {
        requests.push({
          url:
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.href
                : input.url,
          method: init?.method,
        });
        return Promise.resolve(Response.json(ITEM));
      },
    );
    const input = {
      kind: "experience",
      title: "Platform Engineer",
      employer: "Example Labs",
      startDate: "2024-01-01",
      current: true,
    } as const;

    await expect(profile.save(input)).resolves.toEqual(ITEM);
    await expect(profile.save(input, ITEM.itemId)).resolves.toEqual(ITEM);
    expect(requests).toEqual([
      {
        url: "https://profile.example.invalid/v1/profile/items",
        method: "POST",
      },
      {
        url: `https://profile.example.invalid/v1/profile/items/${ITEM.itemId}`,
        method: "PUT",
      },
    ]);
  });

  it("loads, updates and pauses versioned search criteria idempotently", async () => {
    const requests: { url: string; init: RequestInit | undefined }[] = [];
    const profile = new HttpProfile(
      "https://profile.example.invalid",
      tokens("synthetic-token"),
      (input, init) => {
        requests.push({
          url:
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.href
                : input.url,
          init,
        });
        return Promise.resolve(Response.json(SEARCH));
      },
    );

    await expect(profile.getSearchCriteria()).resolves.toEqual(SEARCH);
    await expect(
      profile.saveSearchCriteria(SEARCH_INPUT, "criteria-command-1"),
    ).resolves.toEqual(SEARCH);
    await expect(
      profile.setSearchState("paused", "criteria-command-2"),
    ).resolves.toEqual(SEARCH);

    expect(requests.map(({ url, init }) => [url, init?.method])).toEqual([
      ["https://profile.example.invalid/v1/profile/search-criteria", "GET"],
      ["https://profile.example.invalid/v1/profile/search-criteria", "PUT"],
      [
        "https://profile.example.invalid/v1/profile/search-criteria/pause",
        "POST",
      ],
    ]);
    expect(new Headers(requests[1]?.init?.headers).get("Idempotency-Key")).toBe(
      "criteria-command-1",
    );
    expect(new Headers(requests[2]?.init?.headers).get("Idempotency-Key")).toBe(
      "criteria-command-2",
    );
    expect(requests[1]?.init?.body).toBe(JSON.stringify(SEARCH_INPUT));
  });

  it("maps absent and malformed search criteria safely", async () => {
    const absent = new HttpProfile(
      "https://profile.example.invalid",
      tokens("synthetic-token"),
      () => Promise.resolve(new Response(null, { status: 404 })),
    );
    await expect(absent.getSearchCriteria()).resolves.toBeNull();

    const malformed = new HttpProfile(
      "https://profile.example.invalid",
      tokens("synthetic-token"),
      () => Promise.resolve(Response.json({ ...SEARCH, version: 0 })),
    );
    await expect(malformed.getSearchCriteria()).rejects.toThrow(
      ProfileUnavailableError,
    );
  });

  it("rejects malformed successful responses at the adapter boundary", async () => {
    const profile = new HttpProfile(
      "https://profile.example.invalid",
      tokens("synthetic-token"),
      () => Promise.resolve(Response.json({ items: [{ kind: "experience" }] })),
    );

    await expect(profile.list()).rejects.toThrow(ProfileUnavailableError);

    const invalidJson = new HttpProfile(
      "https://profile.example.invalid",
      tokens("synthetic-token"),
      () => Promise.resolve(new Response("not-json", { status: 200 })),
    );
    await expect(invalidJson.list()).rejects.toThrow(ProfileUnavailableError);

    const failed = new HttpProfile(
      "https://profile.example.invalid",
      tokens("synthetic-token"),
      () => Promise.resolve(new Response(null, { status: 500 })),
    );
    await expect(failed.list()).rejects.toThrow(ProfileUnavailableError);

    const offline = new HttpProfile(
      "https://profile.example.invalid",
      tokens("synthetic-token"),
      () => Promise.reject(new Error("private network detail")),
    );
    await expect(offline.list()).rejects.toThrow(ProfileUnavailableError);
  });
});
