import type { ProfileItem, ProfileItemInput } from "./profile";

export class ProfileAccessDeniedError extends Error {}
export class ProfileValidationError extends Error {}
export class ProfileUnavailableError extends Error {}

export interface ProfilePort {
  list(): Promise<readonly ProfileItem[]>;
  save(input: ProfileItemInput, itemId?: string): Promise<ProfileItem>;
}
