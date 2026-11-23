import { NavLink, Outlet } from "react-router-dom";

import { useAuth } from "../auth/auth-context";

const navigation = [
  { label: "Overview", to: "/app" },
  { label: "Profile", to: "/app/profile" },
  { label: "Jobs", to: "/app/jobs" },
  { label: "Resumes", to: "/app/resumes" },
  { label: "Applications", to: "/app/applications" },
] as const;

export function AppShell() {
  const { state, signOut } = useAuth();
  if (state.status !== "authenticated") return null;

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <a className="brand" href="/app" aria-label="CareerOS overview">
          <span className="brand-mark">C</span>
          <span>CareerOS</span>
        </a>
        <nav aria-label="Primary navigation">
          {navigation.map((item) => (
            <NavLink
              className={({ isActive }) =>
                isActive ? "nav-link active" : "nav-link"
              }
              end={item.to === "/app"}
              key={item.to}
              to={item.to}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="session-card">
          <span className="eyebrow">Signed in</span>
          <strong>{state.session.user.displayName}</strong>
          <button
            className="text-button"
            type="button"
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        </div>
      </aside>
      <div className="content-column">
        <header className="topbar">
          <p>Your career workspace</p>
          <span className="privacy-chip">Private session</span>
        </header>
        <Outlet />
      </div>
    </div>
  );
}
