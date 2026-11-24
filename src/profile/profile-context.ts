import { createContext, useContext } from "react";

import type { ProfilePort } from "./profile-port";

export const ProfileContext = createContext<ProfilePort | null>(null);

export function useProfilePort(): ProfilePort {
  const value = useContext(ProfileContext);
  if (value === null)
    throw new Error("useProfilePort must be used inside ProfileProvider.");
  return value;
}
