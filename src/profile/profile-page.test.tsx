import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  inputFromItem,
  profileItemInputSchema,
  type ProfileItem,
  type ProfileItemInput,
} from "./profile";
import { ProfileProvider } from "./profile-provider";
import { ProfilePage } from "./profile-page";
import {
  ProfileAccessDeniedError,
  type ProfilePort,
  ProfileValidationError,
} from "./profile-port";

const EXPERIENCE: ProfileItem = {
  kind: "experience",
  itemId: "00000000-0000-4000-8000-000000000001",
  title: "Platform Engineer",
  employer: "Example Labs",
  startDate: "2024-01-01",
  current: true,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  provenance: {
    origin: "directEntry",
    recordedAt: "2026-01-01T00:00:00Z",
  },
  validationStatus: "userConfirmed",
};

const EDUCATION: ProfileItem = {
  kind: "education",
  itemId: "00000000-0000-4000-8000-000000000002",
  institution: "Example Institute",
  qualification: "Synthetic Diploma",
  fieldOfStudy: "Software Systems",
  startDate: "2020-09-01",
  endDate: "2022-06-30",
  current: false,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  provenance: EXPERIENCE.provenance,
  validationStatus: "userConfirmed",
};

const SKILL: ProfileItem = {
  kind: "skill",
  itemId: "00000000-0000-4000-8000-000000000003",
  name: "Python",
  level: "advanced",
  levelSource: "selfDeclared",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  provenance: EXPERIENCE.provenance,
  validationStatus: "userConfirmed",
};

class FakeProfile implements ProfilePort {
  listResult: Promise<readonly ProfileItem[]>;
  saveCalls: { input: ProfileItemInput; itemId?: string }[] = [];
  saveError: Error | null = null;

  constructor(items: readonly ProfileItem[] | Promise<readonly ProfileItem[]>) {
    this.listResult = Promise.resolve(items);
  }

  list(): Promise<readonly ProfileItem[]> {
    return this.listResult;
  }

  save(input: ProfileItemInput, itemId?: string): Promise<ProfileItem> {
    this.saveCalls.push({ input, ...(itemId === undefined ? {} : { itemId }) });
    if (this.saveError !== null) return Promise.reject(this.saveError);
    if (input.kind === "experience") {
      return Promise.resolve({
        ...EXPERIENCE,
        ...input,
        itemId: itemId ?? EXPERIENCE.itemId,
      });
    }
    if (input.kind === "education") {
      return Promise.resolve({
        ...EDUCATION,
        ...input,
        itemId: itemId ?? EDUCATION.itemId,
      });
    }
    return Promise.resolve({
      ...SKILL,
      ...input,
      itemId: itemId ?? SKILL.itemId,
      ...(input.level === undefined ? {} : { levelSource: "selfDeclared" }),
    });
  }
}

function renderProfile(profilePort: ProfilePort) {
  render(
    <ProfileProvider profilePort={profilePort}>
      <ProfilePage />
    </ProfileProvider>,
  );
}

describe("ProfilePage", () => {
  it("shows a non-disclosing loading state before owned facts arrive", () => {
    renderProfile(new FakeProfile(new Promise(() => undefined)));

    expect(screen.getByRole("status").textContent).toMatch(
      /loading your profile/i,
    );
    expect(screen.queryByText(/platform engineer/i)).toBeNull();
  });

  it("onboards an empty profile and reports the saved fact", async () => {
    const profile = new FakeProfile([]);
    renderProfile(profile);
    const user = userEvent.setup();

    expect(await screen.findByText(/start with one fact/i)).not.toBeNull();
    await user.type(screen.getByLabelText(/role title/i), "Platform Engineer");
    await user.type(screen.getByLabelText(/employer/i), "Example Labs");
    await user.type(screen.getByLabelText(/start date/i), "2024-01-01");
    await user.click(screen.getByLabelText(/this is current/i));
    await user.click(screen.getByRole("button", { name: /add fact/i }));

    expect((await screen.findByRole("status")).textContent).toMatch(
      /profile fact saved/i,
    );
    expect(screen.getByText("Platform Engineer")).not.toBeNull();
    expect(profile.saveCalls).toEqual([
      {
        input: {
          kind: "experience",
          title: "Platform Engineer",
          employer: "Example Labs",
          startDate: "2024-01-01",
          current: true,
        },
      },
    ]);
  });

  it("rejects an invalid date range before calling the service", async () => {
    const profile = new FakeProfile([]);
    renderProfile(profile);
    const user = userEvent.setup();

    await screen.findByText(/start with one fact/i);
    await user.type(screen.getByLabelText(/role title/i), "Invalid role");
    await user.type(screen.getByLabelText(/employer/i), "Example Labs");
    await user.type(screen.getByLabelText(/start date/i), "2026-02-01");
    await user.type(screen.getByLabelText(/end date/i), "2026-01-01");
    await user.click(screen.getByRole("button", { name: /add fact/i }));

    expect((await screen.findByRole("alert")).textContent).toMatch(
      /end date must be/i,
    );
    expect(profile.saveCalls).toHaveLength(0);
  });

  it("supports education and self-declared skill onboarding variants", async () => {
    const profile = new FakeProfile([]);
    renderProfile(profile);
    const user = userEvent.setup();

    await screen.findByText(/start with one fact/i);
    await user.selectOptions(screen.getByLabelText(/fact type/i), "education");
    await user.type(screen.getByLabelText(/institution/i), "Example Institute");
    await user.type(
      screen.getByLabelText(/qualification/i),
      "Synthetic Diploma",
    );
    await user.type(screen.getByLabelText(/start date/i), "2020-09-01");
    await user.type(screen.getByLabelText(/end date/i), "2022-06-30");
    await user.click(screen.getByRole("button", { name: /add fact/i }));

    expect(await screen.findByText("Synthetic Diploma")).not.toBeNull();
    await user.selectOptions(screen.getByLabelText(/fact type/i), "skill");
    await user.type(screen.getByLabelText(/skill name/i), "Python");
    await user.selectOptions(
      screen.getByLabelText(/self-declared level/i),
      "advanced",
    );
    await user.click(screen.getByRole("button", { name: /add fact/i }));

    expect(await screen.findByText("Python")).not.toBeNull();
    expect(screen.getByText(/advanced · self-declared/i)).not.toBeNull();
  });

  it("edits a loaded fact through the injected profile port", async () => {
    const profile = new FakeProfile([EXPERIENCE]);
    renderProfile(profile);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const title = screen.getByLabelText(/role title/i);
    await user.clear(title);
    await user.type(title, "Senior Platform Engineer");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText("Senior Platform Engineer")).not.toBeNull();
    expect(profile.saveCalls[0]?.itemId).toBe(EXPERIENCE.itemId);
  });

  it("shows a stable error when service validation rejects a save", async () => {
    const profile = new FakeProfile([]);
    profile.saveError = new ProfileValidationError("private service detail");
    renderProfile(profile);
    const user = userEvent.setup();

    await screen.findByText(/start with one fact/i);
    await user.type(screen.getByLabelText(/role title/i), "Platform Engineer");
    await user.type(screen.getByLabelText(/employer/i), "Example Labs");
    await user.type(screen.getByLabelText(/start date/i), "2024-01-01");
    await user.click(screen.getByLabelText(/this is current/i));
    await user.click(screen.getByRole("button", { name: /add fact/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/service rejected these values/i);
    expect(alert.textContent).not.toMatch(/private service detail/i);
  });

  it("fails closed on authorization denial without rendering profile facts", async () => {
    const profile: ProfilePort = {
      list: () =>
        Promise.reject(new ProfileAccessDeniedError("secret token detail")),
      save: vi.fn(),
    };
    renderProfile(profile);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/profile could not be opened/i);
    expect(alert.textContent).not.toMatch(/secret|token|platform engineer/i);
  });

  it("offers a safe retry when the profile service is unavailable", async () => {
    const profile = new FakeProfile(
      Promise.reject(new Error("private upstream detail")),
    );
    renderProfile(profile);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/profile is unavailable/i);
    expect(alert.textContent).not.toMatch(/private upstream detail/i);
    expect(screen.getByRole("button", { name: /try again/i })).not.toBeNull();
  });

  it("maps saved education and skill facts back to editable input", () => {
    expect(inputFromItem(EDUCATION)).toEqual({
      kind: "education",
      institution: "Example Institute",
      qualification: "Synthetic Diploma",
      fieldOfStudy: "Software Systems",
      startDate: "2020-09-01",
      endDate: "2022-06-30",
      current: false,
    });
    expect(inputFromItem(SKILL)).toEqual({
      kind: "skill",
      name: "Python",
      level: "advanced",
    });
    expect(
      profileItemInputSchema.safeParse({
        ...inputFromItem(EXPERIENCE),
        endDate: "2025-01-01",
      }).success,
    ).toBe(false);
  });
});
