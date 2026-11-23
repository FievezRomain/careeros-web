export type SessionUser = Readonly<{
  subject: string;
  displayName: string;
}>;

export type AuthenticatedSession = Readonly<{
  user: SessionUser;
}>;

export type CompletedSignIn = Readonly<{
  session: AuthenticatedSession;
  returnTo: string;
}>;

export type SessionListener = () => void;

export interface SessionPort {
  restore(): Promise<AuthenticatedSession | null>;
  beginSignIn(returnTo: string): Promise<void>;
  completeSignIn(): Promise<CompletedSignIn>;
  signOut(): Promise<void>;
  onSessionChanged(listener: SessionListener): () => void;
}

export function safeReturnTo(value: unknown): string {
  return typeof value === "string" &&
    value.startsWith("/app") &&
    !value.startsWith("//")
    ? value
    : "/app";
}
