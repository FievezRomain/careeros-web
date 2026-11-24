import type { PropsWithChildren } from "react";

import { ProfileContext } from "./profile-context";
import type { ProfilePort } from "./profile-port";

export function ProfileProvider({
  profilePort,
  children,
}: PropsWithChildren<{ profilePort: ProfilePort }>) {
  return (
    <ProfileContext.Provider value={profilePort}>
      {children}
    </ProfileContext.Provider>
  );
}
