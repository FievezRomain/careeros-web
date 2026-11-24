import { describe, expect, it } from "vitest";

import { loadEnvironment } from "./environment";

const validEnvironment = {
  VITE_OIDC_AUTHORITY: "https://identity.example.invalid/realms/careeros",
  VITE_OIDC_CLIENT_ID: "careeros-web",
  VITE_OIDC_REDIRECT_URI: "https://web.example.invalid/auth/callback",
  VITE_OIDC_POST_LOGOUT_REDIRECT_URI: "https://web.example.invalid/sign-in",
  VITE_PROFILE_API_BASE_URL: "https://profile.example.invalid",
};

describe("loadEnvironment", () => {
  it("accepts the public OIDC client configuration", () => {
    expect(loadEnvironment(validEnvironment)).toEqual(validEnvironment);
  });

  it("rejects missing or malformed configuration without echoing values", () => {
    expect(() =>
      loadEnvironment({
        ...validEnvironment,
        VITE_OIDC_AUTHORITY: "not-a-url",
      }),
    ).toThrow("Invalid web authentication configuration.");
  });
});
