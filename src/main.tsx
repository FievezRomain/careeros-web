import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";

import { AuthProvider } from "./auth/auth-provider";
import { OidcSession } from "./auth/oidc-session";
import { createAppRouter } from "./app/router";
import { loadEnvironment } from "./config/environment";
import "./styles.css";

const root = document.getElementById("root");
if (root === null) throw new Error("CareerOS application root is missing.");

const session = new OidcSession(loadEnvironment(import.meta.env));
const router = createAppRouter();

createRoot(root).render(
  <StrictMode>
    <AuthProvider sessionPort={session}>
      <RouterProvider router={router} />
    </AuthProvider>
  </StrictMode>,
);
