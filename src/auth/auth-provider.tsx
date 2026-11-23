import { useEffect, useMemo, useState, type PropsWithChildren } from "react";

import {
  AuthContext,
  type AuthContextValue,
  type AuthState,
} from "./auth-context";
import type { SessionPort } from "./session";

export function AuthProvider({
  sessionPort,
  children,
}: PropsWithChildren<{ sessionPort: SessionPort }>) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    const restore = () => {
      void sessionPort.restore().then(
        (session) => {
          if (!active) return;
          setState(
            session === null
              ? { status: "anonymous" }
              : { status: "authenticated", session },
          );
        },
        () => {
          if (active) setState({ status: "error" });
        },
      );
    };
    restore();
    const unsubscribe = sessionPort.onSessionChanged(restore);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [sessionPort]);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      beginSignIn: (returnTo) => sessionPort.beginSignIn(returnTo),
      completeSignIn: async () => {
        try {
          const completed = await sessionPort.completeSignIn();
          setState({ status: "authenticated", session: completed.session });
          return completed.returnTo;
        } catch {
          setState({ status: "error" });
          throw new Error("Unable to complete sign-in.");
        }
      },
      signOut: async () => {
        await sessionPort.signOut();
        setState({ status: "anonymous" });
      },
    }),
    [sessionPort, state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
