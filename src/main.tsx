import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";

import { AuthProvider } from "./auth/auth-provider";
import { OidcSession } from "./auth/oidc-session";
import { createAppRouter } from "./app/router";
import { loadEnvironment } from "./config/environment";
import { JobsContext } from "./jobs/jobs-context";
import { HttpJobs } from "./jobs/jobs-http";
import { ProfileProvider } from "./profile/profile-provider";
import { HttpProfile } from "./profile/profile-http";
import "./styles.css";

const root = document.getElementById("root");
if (root === null) throw new Error("CareerOS application root is missing.");

const environment = loadEnvironment(import.meta.env);
const session = new OidcSession(environment);
const profile = new HttpProfile(environment.VITE_PROFILE_API_BASE_URL, session);
const jobs = new HttpJobs(
  environment.VITE_JOB_API_BASE_URL ?? "/api/jobs",
  environment.VITE_MATCHING_API_BASE_URL ?? "/api/matching",
  session,
);
const router = createAppRouter();

createRoot(root).render(
  <StrictMode>
    <AuthProvider sessionPort={session}>
      <ProfileProvider profilePort={profile}>
        <JobsContext.Provider value={jobs}>
          <RouterProvider router={router} />
        </JobsContext.Provider>
      </ProfileProvider>
    </AuthProvider>
  </StrictMode>,
);
