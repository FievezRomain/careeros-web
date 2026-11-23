import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { AuthProvider } from "../auth/auth-provider";
import type {
  AuthenticatedSession,
  CompletedSignIn,
  SessionListener,
  SessionPort,
} from "../auth/session";
import { routes } from "./router";

const SESSION: AuthenticatedSession = {
  user: { subject: "synthetic-user-001", displayName: "Synthetic Person" },
};

class FakeSessionPort implements SessionPort {
  restoreResult: Promise<AuthenticatedSession | null>;
  completeResult: Promise<CompletedSignIn> = Promise.resolve({
    session: SESSION,
    returnTo: "/app",
  });
  beginSignInCalls: string[] = [];
  signOutCalls = 0;
  listener: SessionListener | null = null;

  constructor(
    session: AuthenticatedSession | null | Promise<AuthenticatedSession | null>,
  ) {
    this.restoreResult = Promise.resolve(session);
  }

  restore(): Promise<AuthenticatedSession | null> {
    return this.restoreResult;
  }

  beginSignIn(returnTo: string): Promise<void> {
    this.beginSignInCalls.push(returnTo);
    return Promise.resolve();
  }

  completeSignIn(): Promise<CompletedSignIn> {
    return this.completeResult;
  }

  signOut(): Promise<void> {
    this.signOutCalls += 1;
    return Promise.resolve();
  }

  onSessionChanged(listener: SessionListener): () => void {
    this.listener = listener;
    return () => {
      this.listener = null;
    };
  }
}

function renderRoute(path: string, sessionPort: SessionPort) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AuthProvider sessionPort={sessionPort}>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
  return router;
}

describe("protected application shell", () => {
  it("redirects an anonymous visitor without rendering private navigation", async () => {
    const port = new FakeSessionPort(null);
    renderRoute("/app/profile", port);

    expect(
      await screen.findByRole("heading", { name: /build your next move/i }),
    ).not.toBeNull();
    expect(screen.queryByRole("navigation", { name: /primary/i })).toBeNull();

    await userEvent.click(
      screen.getByRole("button", { name: /sign in securely/i }),
    );
    expect(port.beginSignInCalls).toEqual(["/app/profile"]);
  });

  it("renders the authenticated shell and protected primary navigation", async () => {
    const port = new FakeSessionPort(SESSION);
    renderRoute("/app", port);

    expect(await screen.findByText("Synthetic Person")).not.toBeNull();
    expect(screen.getByRole("navigation", { name: /primary/i })).not.toBeNull();
    expect(
      screen.getByRole("link", { name: "Profile" }).getAttribute("href"),
    ).toBe("/app/profile");

    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(port.signOutCalls).toBe(1);
    await waitFor(() => {
      expect(screen.queryByText("Synthetic Person")).toBeNull();
    });
  });

  it("shows a non-disclosing loading state while session restoration is pending", () => {
    const pending = new Promise<AuthenticatedSession | null>(() => undefined);
    renderRoute("/app", new FakeSessionPort(pending));

    expect(screen.getByRole("status").textContent).toMatch(
      /restoring your secure session/i,
    );
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("rejects a failed authorization callback with a stable public error", async () => {
    const port = new FakeSessionPort(null);
    port.completeResult = Promise.reject(
      new Error("provider payload must not leak"),
    );
    renderRoute("/auth/callback?code=synthetic&state=synthetic", port);

    expect(
      await screen.findByRole("heading", { name: /could not be completed/i }),
    ).not.toBeNull();
    expect(document.body.textContent).not.toContain(
      "provider payload must not leak",
    );
  });
});
