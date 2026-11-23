import { z } from "zod";

const environmentSchema = z.object({
  VITE_OIDC_AUTHORITY: z.url(),
  VITE_OIDC_CLIENT_ID: z.string().trim().min(1),
  VITE_OIDC_REDIRECT_URI: z.url(),
  VITE_OIDC_POST_LOGOUT_REDIRECT_URI: z.url(),
});

export type WebEnvironment = Readonly<z.infer<typeof environmentSchema>>;

export function loadEnvironment(
  source: Record<string, unknown>,
): WebEnvironment {
  const result = environmentSchema.safeParse(source);
  if (!result.success) {
    throw new Error("Invalid web authentication configuration.");
  }
  return Object.freeze(result.data);
}
