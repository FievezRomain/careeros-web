import type { AccessTokenPort } from "../auth/session";
import {
  profileItemPageSchema,
  profileItemSchema,
  searchCriteriaSnapshotSchema,
  type ProfileItem,
  type ProfileItemInput,
  type SearchCriteriaInput,
  type SearchCriteriaSnapshot,
} from "./profile";
import {
  ProfileAccessDeniedError,
  type ProfilePort,
  ProfileUnavailableError,
  ProfileValidationError,
} from "./profile-port";

type FetchPort = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export class HttpProfile implements ProfilePort {
  readonly #baseUrl: string;
  readonly #tokens: AccessTokenPort;
  readonly #fetch: FetchPort;

  constructor(
    baseUrl: string,
    tokens: AccessTokenPort,
    fetchPort: FetchPort = globalThis.fetch.bind(globalThis),
  ) {
    this.#baseUrl = baseUrl.replace(/\/$/, "");
    this.#tokens = tokens;
    this.#fetch = fetchPort;
  }

  async list(): Promise<readonly ProfileItem[]> {
    const response = await this.#request("/v1/profile/items", {
      method: "GET",
    });
    const parsed = profileItemPageSchema.safeParse(await this.#json(response));
    if (!parsed.success)
      throw new ProfileUnavailableError("Invalid profile response.");
    return parsed.data.items;
  }

  async save(input: ProfileItemInput, itemId?: string): Promise<ProfileItem> {
    const path =
      itemId === undefined
        ? "/v1/profile/items"
        : `/v1/profile/items/${encodeURIComponent(itemId)}`;
    const response = await this.#request(path, {
      method: itemId === undefined ? "POST" : "PUT",
      body: JSON.stringify(input),
    });
    const parsed = profileItemSchema.safeParse(await this.#json(response));
    if (!parsed.success)
      throw new ProfileUnavailableError("Invalid profile response.");
    return parsed.data;
  }

  async getSearchCriteria(): Promise<SearchCriteriaSnapshot | null> {
    const response = await this.#request(
      "/v1/profile/search-criteria",
      { method: "GET" },
      true,
    );
    if (response.status === 404) return null;
    return this.#searchCriteria(await this.#json(response));
  }

  async saveSearchCriteria(
    input: SearchCriteriaInput,
    idempotencyKey: string,
  ): Promise<SearchCriteriaSnapshot> {
    const response = await this.#request("/v1/profile/search-criteria", {
      method: "PUT",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(input),
    });
    return this.#searchCriteria(await this.#json(response));
  }

  async setSearchState(
    state: "active" | "paused",
    idempotencyKey: string,
  ): Promise<SearchCriteriaSnapshot> {
    const action = state === "active" ? "resume" : "pause";
    const response = await this.#request(
      `/v1/profile/search-criteria/${action}`,
      {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
      },
    );
    return this.#searchCriteria(await this.#json(response));
  }

  async #request(
    path: string,
    init: RequestInit,
    allowNotFound = false,
  ): Promise<Response> {
    const token = await this.#tokens.getAccessToken();
    if (token === null)
      throw new ProfileAccessDeniedError("Profile access requires a session.");

    let response: Response;
    try {
      const headers = new Headers(init.headers);
      headers.set("Accept", "application/json");
      headers.set("Authorization", `Bearer ${token}`);
      if (init.body !== undefined)
        headers.set("Content-Type", "application/json");
      response = await this.#fetch(`${this.#baseUrl}${path}`, {
        ...init,
        headers,
      });
    } catch {
      throw new ProfileUnavailableError("Profile service is unavailable.");
    }

    if (response.status === 401 || response.status === 403) {
      throw new ProfileAccessDeniedError("Profile access was denied.");
    }
    if (response.status === 422 || response.status === 409) {
      throw new ProfileValidationError("The profile item is invalid.");
    }
    if (allowNotFound && response.status === 404) return response;
    if (!response.ok)
      throw new ProfileUnavailableError("Profile request failed.");
    return response;
  }

  async #json(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      throw new ProfileUnavailableError("Invalid profile response.");
    }
  }

  #searchCriteria(value: unknown): SearchCriteriaSnapshot {
    const parsed = searchCriteriaSnapshotSchema.safeParse(value);
    if (!parsed.success)
      throw new ProfileUnavailableError("Invalid search criteria response.");
    return parsed.data;
  }
}
