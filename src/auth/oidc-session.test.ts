import {
  User,
  WebStorageStateStore,
  type SignoutRedirectArgs,
} from "oidc-client-ts";
import { describe, expect, it } from "vitest";

import type { WebEnvironment } from "../config/environment";
import {
  OidcSession,
  oidcSettings,
  type OidcUserManager,
} from "./oidc-session";

const environment: WebEnvironment = {
  VITE_OIDC_AUTHORITY: "https://identity.example.invalid/realms/careeros",
  VITE_OIDC_CLIENT_ID: "careeros-web",
  VITE_OIDC_REDIRECT_URI: "https://web.example.invalid/auth/callback",
  VITE_OIDC_POST_LOGOUT_REDIRECT_URI: "https://web.example.invalid/sign-in",
};

function user(
  options: Readonly<{
    expiresAt?: number;
    idToken?: string;
    name?: string;
    preferredUsername?: string;
    state?: unknown;
  }> = {},
): User {
  return new User({
    access_token: "synthetic-access-token",
    token_type: "Bearer",
    profile: {
      sub: "synthetic-user-001",
      iss: environment.VITE_OIDC_AUTHORITY,
      aud: environment.VITE_OIDC_CLIENT_ID,
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      ...(options.name === undefined ? {} : { name: options.name }),
      ...(options.preferredUsername === undefined
        ? {}
        : { preferred_username: options.preferredUsername }),
    },
    expires_at: options.expiresAt ?? Math.floor(Date.now() / 1000) + 3600,
    ...(options.idToken === undefined ? {} : { id_token: options.idToken }),
    userState: options.state,
  });
}

function fakeManager(initialUser: User | null) {
  let currentUser = initialUser;
  let redirectState: unknown;
  let signoutArgs: SignoutRedirectArgs | undefined;
  let removeCalls = 0;
  let callbackUser = initialUser ?? user({ state: { returnTo: "/app" } });
  const addedEvents: string[] = [];
  const removedEvents: string[] = [];

  const manager: OidcUserManager = {
    getUser: () => Promise.resolve(currentUser),
    removeUser: () => {
      removeCalls += 1;
      currentUser = null;
      return Promise.resolve();
    },
    signinRedirect: (args) => {
      redirectState = args?.state;
      return Promise.resolve();
    },
    signinRedirectCallback: () => Promise.resolve(callbackUser),
    signoutRedirect: (args) => {
      signoutArgs = args;
      return Promise.resolve();
    },
    events: {
      addUserLoaded: () => {
        addedEvents.push("loaded");
        return () => undefined;
      },
      removeUserLoaded: () => {
        removedEvents.push("loaded");
      },
      addUserUnloaded: () => {
        addedEvents.push("unloaded");
        return () => undefined;
      },
      removeUserUnloaded: () => {
        removedEvents.push("unloaded");
      },
      addUserSignedOut: () => {
        addedEvents.push("signedOut");
        return () => undefined;
      },
      removeUserSignedOut: () => {
        removedEvents.push("signedOut");
      },
      addAccessTokenExpired: () => {
        addedEvents.push("expired");
        return () => undefined;
      },
      removeAccessTokenExpired: () => {
        removedEvents.push("expired");
      },
    },
  };

  return {
    manager,
    observations: {
      addedEvents,
      removedEvents,
      get redirectState() {
        return redirectState;
      },
      get signoutArgs() {
        return signoutArgs;
      },
      get removeCalls() {
        return removeCalls;
      },
      set callbackUser(value: User) {
        callbackUser = value;
      },
    },
  };
}

describe("oidcSettings", () => {
  it("uses authorization code with PKCE-compatible session stores and no browser secret", () => {
    const settings = oidcSettings(environment, window.sessionStorage);

    expect(settings.response_type).toBe("code");
    expect(settings.userStore).toBeInstanceOf(WebStorageStateStore);
    expect(settings.stateStore).toBeInstanceOf(WebStorageStateStore);
    expect(settings.automaticSilentRenew).toBe(false);
    expect(settings).not.toHaveProperty("client_secret");
  });
});

describe("OidcSession", () => {
  it("maps only safe identity claims from an active user", async () => {
    const fake = fakeManager(user({ name: "Synthetic Person" }));
    const session = new OidcSession(
      environment,
      window.sessionStorage,
      fake.manager,
    );

    await expect(session.restore()).resolves.toEqual({
      user: { subject: "synthetic-user-001", displayName: "Synthetic Person" },
    });
  });

  it("removes expired state and treats it as anonymous", async () => {
    const fake = fakeManager(user({ expiresAt: 1 }));
    const session = new OidcSession(
      environment,
      window.sessionStorage,
      fake.manager,
    );

    await expect(session.restore()).resolves.toBeNull();
    expect(fake.observations.removeCalls).toBe(1);
  });

  it("starts sign-in only with a validated protected return path", async () => {
    const fake = fakeManager(null);
    const session = new OidcSession(
      environment,
      window.sessionStorage,
      fake.manager,
    );

    await session.beginSignIn("https://evil.example/app");
    expect(fake.observations.redirectState).toEqual({ returnTo: "/app" });
  });

  it("completes sign-in and validates provider-returned state", async () => {
    const fake = fakeManager(null);
    fake.observations.callbackUser = user({
      preferredUsername: "synthetic-person",
      state: { returnTo: "/app/profile" },
    });
    const session = new OidcSession(
      environment,
      window.sessionStorage,
      fake.manager,
    );

    await expect(session.completeSignIn()).resolves.toEqual({
      returnTo: "/app/profile",
      session: {
        user: {
          subject: "synthetic-user-001",
          displayName: "synthetic-person",
        },
      },
    });
  });

  it("signs out with an ID-token hint and clears an already absent session", async () => {
    const active = fakeManager(user({ idToken: "synthetic-id-token" }));
    await new OidcSession(
      environment,
      window.sessionStorage,
      active.manager,
    ).signOut();
    expect(active.observations.signoutArgs).toEqual({
      id_token_hint: "synthetic-id-token",
    });

    const anonymous = fakeManager(null);
    await new OidcSession(
      environment,
      window.sessionStorage,
      anonymous.manager,
    ).signOut();
    expect(anonymous.observations.removeCalls).toBe(1);
  });

  it("subscribes and unsubscribes from every session invalidation event", () => {
    const fake = fakeManager(null);
    const session = new OidcSession(
      environment,
      window.sessionStorage,
      fake.manager,
    );

    const unsubscribe = session.onSessionChanged(() => undefined);
    expect(fake.observations.addedEvents).toEqual([
      "loaded",
      "unloaded",
      "signedOut",
      "expired",
    ]);
    unsubscribe();
    expect(fake.observations.removedEvents).toEqual([
      "loaded",
      "unloaded",
      "signedOut",
      "expired",
    ]);
  });
});
