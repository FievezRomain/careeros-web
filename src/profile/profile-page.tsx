import { useCallback, useEffect, useState, type SyntheticEvent } from "react";

import {
  inputFromItem,
  profileItemInputSchema,
  type ProfileItem,
  type ProfileItemInput,
  type ProfileItemKind,
} from "./profile";
import { useProfilePort } from "./profile-context";
import {
  ProfileAccessDeniedError,
  ProfileValidationError,
} from "./profile-port";

type ProfileState =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "ready"; items: readonly ProfileItem[] }>
  | Readonly<{ status: "denied" }>
  | Readonly<{ status: "error" }>;

function itemTitle(item: ProfileItem): string {
  if (item.kind === "experience") return item.title;
  if (item.kind === "education") return item.qualification;
  return item.name;
}

function itemDetail(item: ProfileItem): string {
  if (item.kind === "experience") return item.employer;
  if (item.kind === "education") return item.institution;
  return item.level === undefined
    ? "Self-declared skill"
    : `${item.level} · self-declared`;
}

function replaceItem(
  items: readonly ProfileItem[],
  saved: ProfileItem,
): readonly ProfileItem[] {
  const index = items.findIndex((item) => item.itemId === saved.itemId);
  if (index < 0) return [...items, saved];
  return items.map((item) => (item.itemId === saved.itemId ? saved : item));
}

export function ProfilePage() {
  const profile = useProfilePort();
  const [state, setState] = useState<ProfileState>({ status: "loading" });
  const [editing, setEditing] = useState<ProfileItem | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  const [notice, setNotice] = useState("");

  const load = useCallback(() => {
    void profile.list().then(
      (items) => {
        setState({ status: "ready", items });
      },
      (error: unknown) => {
        setState(
          error instanceof ProfileAccessDeniedError
            ? { status: "denied" }
            : { status: "error" },
        );
      },
    );
  }, [profile]);

  useEffect(load, [load]);

  if (state.status === "loading") {
    return (
      <main className="profile-state" role="status">
        <span className="state-spinner" aria-hidden="true" />
        <h1>Loading your profile…</h1>
        <p>We are retrieving only the facts owned by your account.</p>
      </main>
    );
  }

  if (state.status === "denied") {
    return (
      <main className="profile-state" role="alert">
        <p className="eyebrow">Access required</p>
        <h1>Your profile could not be opened.</h1>
        <p>Your session does not currently allow access to profile data.</p>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="profile-state" role="alert">
        <p className="eyebrow">Temporary issue</p>
        <h1>Your profile is unavailable.</h1>
        <p>No changes were made. Try loading it again.</p>
        <button
          className="secondary-button"
          type="button"
          onClick={() => {
            setState({ status: "loading" });
            load();
          }}
        >
          Try again
        </button>
      </main>
    );
  }

  const save = async (input: ProfileItemInput): Promise<void> => {
    try {
      const saved = await profile.save(
        input,
        editing === null ? undefined : editing.itemId,
      );
      setState((current) =>
        current.status === "ready"
          ? { status: "ready", items: replaceItem(current.items, saved) }
          : current,
      );
      setEditing(null);
      setFormVersion((value) => value + 1);
      setNotice("Profile fact saved.");
    } catch (error) {
      if (error instanceof ProfileAccessDeniedError) {
        setEditing(null);
        setState({ status: "denied" });
      }
      throw error;
    }
  };

  return (
    <main className="profile-page">
      <header className="profile-heading">
        <div>
          <p className="eyebrow">Verified profile</p>
          <h1>Build your professional evidence.</h1>
          <p className="lead">
            Add only facts you can stand behind. Direct entries are recorded as
            user-confirmed and remain traceable to their source.
          </p>
        </div>
        <div className="profile-progress" aria-label="Profile progress">
          <strong>{state.items.length}</strong>
          <span>{state.items.length === 1 ? "saved fact" : "saved facts"}</span>
        </div>
      </header>
      {notice.length > 0 && (
        <p className="success-message profile-notice" role="status">
          {notice}
        </p>
      )}

      <div className="profile-layout">
        <section aria-labelledby="saved-facts-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Your evidence</p>
              <h2 id="saved-facts-title">Saved facts</h2>
            </div>
          </div>
          {state.items.length === 0 ? (
            <div className="empty-profile">
              <h3>Start with one fact.</h3>
              <p>Add an experience, education item or skill to begin.</p>
            </div>
          ) : (
            <ul className="profile-items">
              {state.items.map((item) => (
                <li key={item.itemId}>
                  <div>
                    <span className="fact-kind">{item.kind}</span>
                    <h3>{itemTitle(item)}</h3>
                    <p>{itemDetail(item)}</p>
                  </div>
                  <div className="fact-actions">
                    <span className={`fact-status ${item.validationStatus}`}>
                      {item.validationStatus === "userConfirmed"
                        ? "Confirmed"
                        : "Needs confirmation"}
                    </span>
                    <button
                      className="text-button dark"
                      type="button"
                      onClick={() => {
                        setEditing(item);
                      }}
                    >
                      Edit
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <ProfileForm
          key={editing?.itemId ?? `new-${formVersion.toString()}`}
          editing={editing}
          onCancel={() => {
            setEditing(null);
          }}
          onSave={save}
        />
      </div>
    </main>
  );
}

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function optionalField(form: FormData, name: string): Record<string, string> {
  const value = field(form, name);
  return value.length === 0 ? {} : { [name]: value };
}

function draftFromForm(form: FormData): unknown {
  const kind = field(form, "kind");
  if (kind === "experience") {
    const current = form.get("current") === "on";
    return {
      kind,
      title: field(form, "title"),
      employer: field(form, "employer"),
      startDate: field(form, "startDate"),
      current,
      ...optionalField(form, "description"),
      ...(current ? {} : optionalField(form, "endDate")),
    };
  }
  if (kind === "education") {
    const current = form.get("current") === "on";
    return {
      kind,
      institution: field(form, "institution"),
      qualification: field(form, "qualification"),
      startDate: field(form, "startDate"),
      current,
      ...optionalField(form, "fieldOfStudy"),
      ...(current ? {} : optionalField(form, "endDate")),
    };
  }
  return {
    kind,
    name: field(form, "name"),
    ...optionalField(form, "level"),
  };
}

function ProfileForm({
  editing,
  onCancel,
  onSave,
}: Readonly<{
  editing: ProfileItem | null;
  onCancel(): void;
  onSave(input: ProfileItemInput): Promise<void>;
}>) {
  const initial = editing === null ? null : inputFromItem(editing);
  const [kind, setKind] = useState<ProfileItemKind>(
    initial?.kind ?? "experience",
  );
  const [current, setCurrent] = useState(
    initial !== null && initial.kind !== "skill" ? initial.current : false,
  );
  const [status, setStatus] = useState<
    "idle" | "saving" | "validation" | "error"
  >("idle");
  const [message, setMessage] = useState("");

  const submit = (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    const parsed = profileItemInputSchema.safeParse(
      draftFromForm(new FormData(event.currentTarget)),
    );
    if (!parsed.success) {
      setStatus("validation");
      setMessage(
        parsed.error.issues[0]?.message ?? "Review the highlighted values.",
      );
      return;
    }

    setStatus("saving");
    setMessage("");
    void onSave(parsed.data).then(
      () => undefined,
      (error: unknown) => {
        if (error instanceof ProfileAccessDeniedError) return;
        setStatus(
          error instanceof ProfileValidationError ? "validation" : "error",
        );
        setMessage(
          error instanceof ProfileValidationError
            ? "The service rejected these values. Review the form and try again."
            : "This fact could not be saved. No changes were made.",
        );
      },
    );
  };

  return (
    <section className="profile-editor" aria-labelledby="profile-editor-title">
      <p className="eyebrow">
        {editing === null ? "Add evidence" : "Correct evidence"}
      </p>
      <h2 id="profile-editor-title">
        {editing === null ? "Add a profile fact" : `Edit ${itemTitle(editing)}`}
      </h2>
      <form onSubmit={submit} noValidate>
        <label>
          Fact type
          <select
            name="kind"
            value={kind}
            disabled={editing !== null}
            onChange={(event) => {
              setKind(event.target.value as ProfileItemKind);
            }}
          >
            <option value="experience">Experience</option>
            <option value="education">Education</option>
            <option value="skill">Skill</option>
          </select>
          {editing !== null && <input type="hidden" name="kind" value={kind} />}
        </label>

        {kind === "experience" && (
          <>
            <label>
              Role title
              <input
                name="title"
                defaultValue={initial?.kind === kind ? initial.title : ""}
              />
            </label>
            <label>
              Employer
              <input
                name="employer"
                defaultValue={initial?.kind === kind ? initial.employer : ""}
              />
            </label>
            <label className="wide-field">
              Description <span>Optional</span>
              <textarea
                name="description"
                rows={4}
                defaultValue={initial?.kind === kind ? initial.description : ""}
              />
            </label>
          </>
        )}

        {kind === "education" && (
          <>
            <label>
              Institution
              <input
                name="institution"
                defaultValue={initial?.kind === kind ? initial.institution : ""}
              />
            </label>
            <label>
              Qualification
              <input
                name="qualification"
                defaultValue={
                  initial?.kind === kind ? initial.qualification : ""
                }
              />
            </label>
            <label className="wide-field">
              Field of study <span>Optional</span>
              <input
                name="fieldOfStudy"
                defaultValue={
                  initial?.kind === kind ? initial.fieldOfStudy : ""
                }
              />
            </label>
          </>
        )}

        {kind === "skill" ? (
          <>
            <label>
              Skill name
              <input
                name="name"
                defaultValue={initial?.kind === kind ? initial.name : ""}
              />
            </label>
            <label>
              Self-declared level <span>Optional</span>
              <select
                name="level"
                defaultValue={initial?.kind === kind ? initial.level : ""}
              >
                <option value="">Not specified</option>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
                <option value="expert">Expert</option>
              </select>
            </label>
          </>
        ) : (
          <>
            <label>
              Start date
              <input
                type="date"
                name="startDate"
                defaultValue={initial?.kind === kind ? initial.startDate : ""}
              />
            </label>
            <label>
              End date <span>Optional</span>
              <input
                type="date"
                name="endDate"
                disabled={current}
                defaultValue={initial?.kind === kind ? initial.endDate : ""}
              />
            </label>
            <label className="checkbox-field wide-field">
              <input
                type="checkbox"
                name="current"
                checked={current}
                onChange={(event) => {
                  setCurrent(event.target.checked);
                }}
              />
              This is current
            </label>
          </>
        )}

        {message.length > 0 && (
          <p className="error-message" role="alert">
            {message}
          </p>
        )}

        <div className="form-actions wide-field">
          <button
            className="primary-button"
            type="submit"
            disabled={status === "saving"}
          >
            {status === "saving"
              ? "Saving…"
              : editing === null
                ? "Add fact"
                : "Save changes"}
          </button>
          {editing !== null && (
            <button
              className="secondary-button"
              type="button"
              onClick={onCancel}
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
