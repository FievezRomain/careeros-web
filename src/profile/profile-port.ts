import type {
  ProfileItem,
  ProfileItemInput,
  SearchCriteriaInput,
  SearchCriteriaSnapshot,
} from "./profile";

export class ProfileAccessDeniedError extends Error {}
export class ProfileValidationError extends Error {}
export class ProfileUnavailableError extends Error {}

export interface ProfilePort {
  list(): Promise<readonly ProfileItem[]>;
  save(input: ProfileItemInput, itemId?: string): Promise<ProfileItem>;
  getSearchCriteria(): Promise<SearchCriteriaSnapshot | null>;
  saveSearchCriteria(
    input: SearchCriteriaInput,
    idempotencyKey: string,
  ): Promise<SearchCriteriaSnapshot>;
  setSearchState(
    state: "active" | "paused",
    idempotencyKey: string,
  ): Promise<SearchCriteriaSnapshot>;
}
