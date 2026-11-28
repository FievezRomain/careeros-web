import {
  Navigate,
  createBrowserRouter,
  type RouteObject,
} from "react-router-dom";

import { AppShell } from "./app-shell";
import {
  AuthCallbackPage,
  NotFoundPage,
  OverviewPage,
  PlaceholderPage,
  SignInPage,
} from "./pages";
import { RequireAuthenticated } from "./require-authenticated";
import { JobCatalogPage, JobDetailPage } from "../jobs/jobs-pages";
import { ProfilePage } from "../profile/profile-page";

export const routes: RouteObject[] = [
  { path: "/", element: <Navigate replace to="/app" /> },
  { path: "/sign-in", element: <SignInPage /> },
  { path: "/auth/callback", element: <AuthCallbackPage /> },
  {
    element: <RequireAuthenticated />,
    children: [
      {
        path: "/app",
        element: <AppShell />,
        children: [
          { index: true, element: <OverviewPage /> },
          {
            path: "profile",
            element: <ProfilePage />,
          },
          { path: "jobs", element: <JobCatalogPage /> },
          { path: "jobs/catalog", element: <JobCatalogPage /> },
          { path: "jobs/:id", element: <JobDetailPage /> },
          {
            path: "resumes",
            element: (
              <PlaceholderPage
                title="Resumes"
                detail="Grounded resume versions will appear here."
              />
            ),
          },
          {
            path: "applications",
            element: (
              <PlaceholderPage
                title="Applications"
                detail="Your approval-first application pipeline will appear here."
              />
            ),
          },
        ],
      },
    ],
  },
  { path: "*", element: <NotFoundPage /> },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
