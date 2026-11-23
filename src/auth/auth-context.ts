import { createContext, useContext } from "react";

import type { AuthenticatedSession } from "./session";

export type AuthState =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "anonymous" }>
  | Readonly<{ status: "authenticated"; session: AuthenticatedSession }>
  | Readonly<{ status: "error" }>;

export type AuthContextValue = Readonly<{
  state: AuthState;
  beginSignIn(returnTo: string): Promise<void>;
  completeSignIn(): Promise<string>;
  signOut(): Promise<void>;
}>;

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null)
    throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}
