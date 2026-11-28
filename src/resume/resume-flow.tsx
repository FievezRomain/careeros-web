import { useContext, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useAuth } from "../auth/auth-context";
import type { RecommendationSummary } from "../jobs/jobs-http";
import {
  pinsSchema,
  ResumeContext,
  ResumeError,
  resumeUrl,
  type ResumePort,
  type ResumeReview,
} from "./resume-client";

const errors: Record<string, string> = {
  denied: "Resume access was denied.",
  notFound: "This resume or recommendation is unavailable to you.",
  invalid: "The selected resume or its sources could not be validated.",
  stale_snapshot:
    "The source facts or recommendation changed. Refresh your recommendations.",
  full_text_required:
    "Verify or manually import the full offer before creating a resume.",
  recommendation_not_qualified: "This recommendation is no longer eligible.",
  missing_facts: "Confirm the missing profile facts before creating a resume.",
};

function Feedback({ error }: { error: unknown }) {
  if (error === null) return null;
  const message = error instanceof ResumeError ? errors[error.kind] : undefined;
  return (
    <div role="alert" className="error-message">
      <p>{message ?? "The resume service is unavailable. You can retry."}</p>
      {error instanceof ResumeError && error.missing.length > 0 && (
        <ul>
          {error.missing.map((item) => (
            <li key={item.requirementId}>{item.statement}</li>
          ))}
        </ul>
      )}
      {error instanceof ResumeError && error.kind === "stale_snapshot" && (
        <Link to="/app/jobs">Refresh recommendations</Link>
      )}
      {error instanceof ResumeError && error.kind === "missing_facts" && (
        <Link to="/app/profile">Review profile facts</Link>
      )}
    </div>
  );
}

export function ResumeAction({
  recommendation,
}: {
  recommendation: RecommendationSummary;
}) {
  const client = useContext(ResumeContext);
  const navigate = useNavigate();
  const active = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(
    () => () => {
      active.current?.abort();
    },
    [],
  );
  if (recommendation.match.sourceAccess === "external_to_verify")
    return (
      <p>Verify or manually import the full offer before creating a resume.</p>
    );
  const pins = pinsSchema.safeParse({
    recommendationId: recommendation.recommendationId,
    evaluationId: recommendation.evaluationId,
    groupId: recommendation.groupId,
    opportunityVersionId: recommendation.match.opportunityVersionId,
    profileSnapshotId: recommendation.match.profileSnapshotId,
    criteriaVersionId: recommendation.criteriaVersionId,
  });
  if (!client || !pins.success || recommendation.state !== "active")
    return null;

  async function create() {
    if (!client || !pins.success || active.current) return;
    const request = new AbortController();
    active.current = request;
    setPending(true);
    setError(null);
    try {
      const version = await client.create(
        pins.data,
        pins.data.evaluationId,
        request.signal,
      );
      if (!request.signal.aborted) await navigate(resumeUrl(version));
    } catch (failure) {
      if (!request.signal.aborted) setError(failure);
    } finally {
      active.current = null;
      if (!request.signal.aborted) setPending(false);
    }
  }

  return (
    <div>
      <button
        className="secondary-button"
        disabled={pending}
        type="button"
        onClick={() => {
          void create();
        }}
      >
        {pending ? "Creating resume…" : "Create resume"}
      </button>
      <Feedback error={error} />
    </div>
  );
}

function Review({
  client,
  id,
  number,
}: {
  client: ResumePort;
  id: string;
  number: number;
}) {
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState<{
    review: ResumeReview;
    url: string;
  } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState<"approve" | "regenerate" | null>(null);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const mutation = useRef<AbortController | null>(null);
  const regenerationKey = useRef<string | null>(null);

  useEffect(() => {
    const request = new AbortController();
    let url: string | undefined;
    void Promise.all([
      client.review(id, number, request.signal),
      client.preview(id, number, request.signal),
    ])
      .then(([review, pdf]) => {
        if (request.signal.aborted) return;
        url = URL.createObjectURL(pdf);
        setLoaded({ review, url });
      })
      .catch((failure: unknown) => {
        if (!request.signal.aborted) setError(failure);
      });
    return () => {
      request.abort();
      mutation.current?.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [client, id, number, previewAttempt]);

  if (!loaded)
    return error === null ? (
      <p role="status">Loading resume preview…</p>
    ) : (
      <>
        <Feedback error={error} />
        {error instanceof ResumeError && error.kind === "unavailable" && (
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setError(null);
              setPreviewAttempt((attempt) => attempt + 1);
            }}
          >
            Retry preview
          </button>
        )}
      </>
    );

  const { review, url } = loaded;
  const pdf = review.version.artifacts.find(
    (artifact) => artifact.format === "pdf",
  );
  const missing = review.version.recommendation.missingRequirements;

  async function send(action: "approve" | "regenerate") {
    if (mutation.current || !review.current) return;
    const request = new AbortController();
    mutation.current = request;
    setPending(action);
    setError(null);
    try {
      if (action === "approve" && confirmed && pdf) {
        const updated = await client.approve(
          id,
          number,
          pdf.sha256,
          request.signal,
        );
        if (!request.signal.aborted) setLoaded({ review: updated, url });
      } else if (action === "regenerate") {
        const key = regenerationKey.current ?? crypto.randomUUID();
        regenerationKey.current = key;
        const version = await client.create(
          review.version.recommendation.pins,
          key,
          request.signal,
        );
        if (!request.signal.aborted) await navigate(resumeUrl(version));
      }
    } catch (failure) {
      if (!request.signal.aborted) {
        setError(failure);
        if (failure instanceof ResumeError && failure.kind === "stale_snapshot")
          setLoaded({
            review: { ...review, current: false, eligibleForPackage: false },
            url,
          });
      }
    } finally {
      mutation.current = null;
      if (!request.signal.aborted) setPending(null);
    }
  }

  return (
    <>
      <h1>Review resume version {number}</h1>
      {!review.current && (
        <p role="alert">
          A source fact changed.{" "}
          <Link to="/app/jobs">Refresh recommendations</Link> to create an
          updated version.
        </p>
      )}
      {missing.length > 0 && (
        <section>
          <h2>Facts to confirm</h2>
          <ul>
            {missing.map((item) => (
              <li key={item.requirementId}>{item.statement}</li>
            ))}
          </ul>
          <Link to="/app/profile">Review profile facts</Link>
        </section>
      )}
      <iframe className="resume-preview" title="Resume PDF preview" src={url} />
      <p>
        <a download="resume.pdf" href={url}>
          Download preview
        </a>
      </p>
      {review.approval && (
        <p role="status">
          {review.eligibleForPackage
            ? "This version is approved for a package."
            : "This version has a historical approval."}
        </p>
      )}
      {review.current && !review.approval && (
        <>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => {
                setConfirmed(event.target.checked);
              }}
            />
            I reviewed this PDF and approve this version for an application
            package.
          </label>
          <button
            className="primary-button"
            disabled={!confirmed || !pdf || pending !== null}
            type="button"
            onClick={() => {
              void send("approve");
            }}
          >
            {pending === "approve" ? "Approving…" : "Approve this version"}
          </button>
        </>
      )}
      {review.current && (
        <button
          className="secondary-button"
          disabled={pending !== null}
          type="button"
          onClick={() => {
            void send("regenerate");
          }}
        >
          {pending === "regenerate" ? "Generating…" : "Regenerate resume"}
        </button>
      )}
      <Feedback error={error} />
    </>
  );
}

export function ResumeReviewPage() {
  const client = useContext(ResumeContext);
  const { state } = useAuth();
  const { id, version } = useParams();
  const subject =
    state.status === "authenticated" ? state.session.user.subject : "";
  return (
    <main className="page-content">
      <Link to="/app/jobs">Back to recommendations</Link>
      {client && id && version ? (
        <Review
          key={JSON.stringify([subject, id, version])}
          client={client}
          id={id}
          number={Number(version)}
        />
      ) : (
        <Feedback error={new ResumeError("invalid")} />
      )}
    </main>
  );
}
