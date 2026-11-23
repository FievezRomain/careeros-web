import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/auth-context";
import { safeReturnTo } from "../auth/session";

function locationReturnTo(value: unknown): string {
  if (typeof value !== "object" || value === null || !("returnTo" in value))
    return "/app";
  return safeReturnTo(value.returnTo);
}

export function SignInPage() {
  const { state, beginSignIn } = useAuth();
  const location = useLocation();
  const returnTo = locationReturnTo(location.state);
  const [pending, setPending] = useState(false);

  if (state.status === "authenticated")
    return <Link to={returnTo}>Continue to your workspace</Link>;

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="sign-in-title">
        <span className="brand auth-brand">
          <span className="brand-mark">C</span>CareerOS
        </span>
        <p className="eyebrow">Private by design</p>
        <h1 id="sign-in-title">Build your next move on verified facts.</h1>
        <p className="auth-copy">
          Sign in to manage your profile, opportunities and applications.
          CareerOS never submits or sends anything without your explicit
          approval.
        </p>
        <button
          className="primary-button"
          disabled={pending || state.status === "loading"}
          type="button"
          onClick={() => {
            setPending(true);
            void beginSignIn(returnTo).catch(() => {
              setPending(false);
            });
          }}
        >
          {pending ? "Opening secure sign in…" : "Sign in securely"}
        </button>
        {state.status === "error" && (
          <p className="error-message" role="alert">
            Sign in is temporarily unavailable.
          </p>
        )}
      </section>
      <aside className="auth-aside" aria-label="CareerOS principles">
        <p className="eyebrow">Your workspace</p>
        <h2>Clear evidence. Human decisions.</h2>
        <ul>
          <li>Profile facts stay traceable to their source.</li>
          <li>Private records remain scoped to your account.</li>
          <li>External actions always wait for your approval.</li>
        </ul>
      </aside>
    </main>
  );
}

export function AuthCallbackPage() {
  const { completeSignIn } = useAuth();
  const navigate = useNavigate();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void completeSignIn()
      .then((returnTo) => {
        void navigate(returnTo, { replace: true });
      })
      .catch(() => {
        setFailed(true);
      });
  }, [completeSignIn, navigate]);

  if (failed) {
    return (
      <main className="centered-state">
        <h1>Sign in could not be completed</h1>
        <p>The authorization response was rejected. Please start again.</p>
        <Link className="primary-link" to="/sign-in">
          Return to sign in
        </Link>
      </main>
    );
  }
  return (
    <main className="centered-state" role="status">
      Completing secure sign in…
    </main>
  );
}

export function OverviewPage() {
  return (
    <main className="page-content">
      <p className="eyebrow">Overview</p>
      <h1>Welcome to your career workspace.</h1>
      <p className="lead">
        Start with a verified profile, then move through each application with
        control.
      </p>
      <div className="card-grid">
        <Link className="feature-card" to="/app/profile">
          <span>01</span>
          <h2>Build your profile</h2>
          <p>Capture experience, education and skills with clear provenance.</p>
        </Link>
        <Link className="feature-card" to="/app/jobs">
          <span>02</span>
          <h2>Track opportunities</h2>
          <p>Keep the roles you care about in one deliberate pipeline.</p>
        </Link>
        <Link className="feature-card" to="/app/applications">
          <span>03</span>
          <h2>Stay in control</h2>
          <p>Review every artifact and approve every external action.</p>
        </Link>
      </div>
    </main>
  );
}

export function PlaceholderPage({
  title,
  detail,
}: Readonly<{ title: string; detail: string }>) {
  return (
    <main className="page-content">
      <p className="eyebrow">Protected workspace</p>
      <h1>{title}</h1>
      <p className="lead">{detail}</p>
    </main>
  );
}

export function NotFoundPage() {
  return (
    <main className="centered-state">
      <h1>Page not found</h1>
      <Link className="primary-link" to="/app">
        Return to CareerOS
      </Link>
    </main>
  );
}
