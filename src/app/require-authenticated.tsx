import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../auth/auth-context";

export function RequireAuthenticated() {
  const { state } = useAuth();
  const location = useLocation();

  if (state.status === "loading") {
    return (
      <main className="centered-state" role="status">
        Restoring your secure session…
      </main>
    );
  }
  if (state.status === "error") {
    return (
      <main className="centered-state">
        <h1>Session unavailable</h1>
        <p>
          CareerOS could not restore your session. No private workspace data was
          loaded.
        </p>
        <a className="primary-link" href="/sign-in">
          Return to sign in
        </a>
      </main>
    );
  }
  if (state.status === "anonymous") {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate replace state={{ returnTo }} to="/sign-in" />;
  }
  return <Outlet />;
}
