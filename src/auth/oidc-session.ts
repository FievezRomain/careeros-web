import {
  UserManager,
  WebStorageStateStore,
  type User,
  type UserManagerSettings,
} from "oidc-client-ts";

import type { WebEnvironment } from "../config/environment";
import {
  safeReturnTo,
  type AccessTokenPort,
  type AuthenticatedSession,
  type CompletedSignIn,
  type SessionListener,
  type SessionPort,
} from "./session";

type SignInState = Readonly<{ returnTo: string }>;

type SessionEvents = Pick<
  UserManager["events"],
  | "addUserLoaded"
  | "removeUserLoaded"
  | "addUserUnloaded"
  | "removeUserUnloaded"
  | "addUserSignedOut"
  | "removeUserSignedOut"
  | "addAccessTokenExpired"
  | "removeAccessTokenExpired"
>;

export type OidcUserManager = Pick<
  UserManager,
  | "getUser"
  | "removeUser"
  | "signinRedirect"
  | "signinRedirectCallback"
  | "signoutRedirect"
> & { readonly events: SessionEvents };

function isSignInState(value: unknown): value is SignInState {
  return (
    typeof value === "object" &&
    value !== null &&
    "returnTo" in value &&
    typeof value.returnTo === "string"
  );
}

function toSession(user: User): AuthenticatedSession {
  const displayName =
    user.profile.name ?? user.profile.preferred_username ?? "CareerOS user";
  return {
    user: {
      subject: user.profile.sub,
      displayName,
    },
  };
}

export function oidcSettings(
  environment: WebEnvironment,
  storage: Storage,
): UserManagerSettings {
  return {
    authority: environment.VITE_OIDC_AUTHORITY,
    client_id: environment.VITE_OIDC_CLIENT_ID,
    redirect_uri: environment.VITE_OIDC_REDIRECT_URI,
    post_logout_redirect_uri: environment.VITE_OIDC_POST_LOGOUT_REDIRECT_URI,
    response_type: "code",
    scope:
      "openid profile email profile:read profile:write jobs:read matching:recommendations:read resume:drafts:generate resume:versions:read resume:versions:write resume:versions:approve",
    loadUserInfo: false,
    monitorSession: true,
    automaticSilentRenew: false,
    userStore: new WebStorageStateStore({
      prefix: "careeros.user.",
      store: storage,
    }),
    stateStore: new WebStorageStateStore({
      prefix: "careeros.state.",
      store: storage,
    }),
  };
}

export class OidcSession implements SessionPort, AccessTokenPort {
  readonly #manager: OidcUserManager;

  constructor(
    environment: WebEnvironment,
    storage: Storage = window.sessionStorage,
    manager?: OidcUserManager,
  ) {
    this.#manager =
      manager ?? new UserManager(oidcSettings(environment, storage));
  }

  async restore(): Promise<AuthenticatedSession | null> {
    const user = await this.#manager.getUser();
    if (user === null || user.expired) {
      if (user !== null) await this.#manager.removeUser();
      return null;
    }
    return toSession(user);
  }

  async getAccessToken(): Promise<string | null> {
    const user = await this.#manager.getUser();
    if (user === null || user.expired || user.access_token.length === 0)
      return null;
    return user.access_token;
  }

  async beginSignIn(returnTo: string): Promise<void> {
    await this.#manager.signinRedirect({
      state: { returnTo: safeReturnTo(returnTo) },
    });
  }

  async completeSignIn(): Promise<CompletedSignIn> {
    const user = await this.#manager.signinRedirectCallback();
    const returnTo = isSignInState(user.state)
      ? safeReturnTo(user.state.returnTo)
      : "/app";
    return { session: toSession(user), returnTo };
  }

  async signOut(): Promise<void> {
    const user = await this.#manager.getUser();
    if (user === null) {
      await this.#manager.removeUser();
      return;
    }
    await this.#manager.signoutRedirect(
      user.id_token === undefined ? {} : { id_token_hint: user.id_token },
    );
  }

  onSessionChanged(listener: SessionListener): () => void {
    this.#manager.events.addUserLoaded(listener);
    this.#manager.events.addUserUnloaded(listener);
    this.#manager.events.addUserSignedOut(listener);
    this.#manager.events.addAccessTokenExpired(listener);
    return () => {
      this.#manager.events.removeUserLoaded(listener);
      this.#manager.events.removeUserUnloaded(listener);
      this.#manager.events.removeUserSignedOut(listener);
      this.#manager.events.removeAccessTokenExpired(listener);
    };
  }
}
