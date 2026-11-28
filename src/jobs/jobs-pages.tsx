import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useParams, useSearchParams } from "react-router-dom";

import { useAuth } from "../auth/auth-context";
import { JobsError, useJobs } from "./jobs-context";
import {
  recommendationPageSize,
  type Job,
  type Recommendation,
} from "./jobs-http";
import { MatchExplanation } from "./match-explanation";

type ReadState<T> =
  { key: string; result: T } | { key: string; error: JobsError };

function useJobRead<T>(
  requestKey: string,
  load: (signal: AbortSignal) => Promise<T>,
) {
  const { state } = useAuth();
  const subject =
    state.status === "authenticated" ? state.session.user.subject : "";
  const key = JSON.stringify([subject, requestKey]);
  const [stateForKey, setState] = useState<ReadState<T>>();
  useEffect(() => {
    const request = new AbortController();
    void load(request.signal).then(
      (result) => {
        if (!request.signal.aborted) setState({ key, result });
      },
      (error: unknown) => {
        if (!request.signal.aborted) {
          setState({
            key,
            error:
              error instanceof JobsError ? error : new JobsError("unavailable"),
          });
        }
      },
    );
    return () => {
      request.abort();
    };
  }, [key, load]);
  return stateForKey?.key === key ? stateForKey : undefined;
}

const messages = {
  denied: "Access to this opportunity was denied.",
  notFound: "This opportunity could not be found.",
  unavailable: "Opportunities could not be loaded. Try again shortly.",
};

function DataView<T>({
  state,
  children,
}: {
  state: ReadState<T> | undefined;
  children: (result: T) => ReactNode;
}) {
  if (!state) return <p role="status">Loading opportunities…</p>;
  if ("error" in state)
    return (
      <p className="error-message" role="alert">
        {messages[state.error.kind]}
      </p>
    );
  return children(state.result);
}

function JobNav() {
  return (
    <nav className="job-nav" aria-label="Jobs">
      <NavLink end to="/app/jobs">
        Recommendations
      </NavLink>
      <NavLink end to="/app/jobs/catalog">
        Browse catalog
      </NavLink>
    </nav>
  );
}

function usePage() {
  const [params] = useSearchParams();
  const page = Number(params.get("page"));
  return Number.isSafeInteger(page) &&
    page > 0 &&
    page <= Math.floor(Number.MAX_SAFE_INTEGER / 20)
    ? page
    : 1;
}

function Pagination({ page, hasMore }: { page: number; hasMore: boolean }) {
  if (page === 1 && !hasMore) return null;
  return (
    <nav className="job-nav" aria-label="Opportunity pages">
      {page > 1 && <Link to={`?page=${String(page - 1)}`}>Previous</Link>}
      <span>Page {page}</span>
      {hasMore && <Link to={`?page=${String(page + 1)}`}>Next</Link>}
    </nav>
  );
}

function SourceBadge({ access }: { access: Job["sourceAccess"] }) {
  return (
    <span
      className={
        access === "full_text" ? "fact-status userConfirmed" : "fact-status"
      }
    >
      {access === "full_text" ? "Verified full text" : "External to verify"}
    </span>
  );
}

function JobRow({
  id,
  title,
  employer,
  access,
  children,
}: {
  id: string;
  title: string;
  employer: string | null;
  access: Job["sourceAccess"];
  children: ReactNode;
}) {
  return (
    <li>
      <div>
        <h2>
          <Link to={`/app/jobs/${id}`}>{title}</Link>
        </h2>
        {employer && <p>{employer}</p>}
      </div>
      <div className="job-row-meta">
        <SourceBadge access={access} />
        {children}
      </div>
    </li>
  );
}

export function RecommendationsPage() {
  const jobs = useJobs();
  const page = usePage();
  const load = useCallback(
    (signal: AbortSignal) =>
      jobs.listRecommendations((page - 1) * recommendationPageSize, signal),
    [jobs, page],
  );
  const state = useJobRead(`recommendations-${String(page)}`, load);
  return (
    <main className="page-content jobs-page">
      <h1>Jobs</h1>
      <JobNav />
      <DataView state={state}>
        {(items) => (
          <>
            {items.length === 0 ? (
              <p>No recommendations on this page.</p>
            ) : (
              <ul className="job-list">
                {items.map(({ groupId, title, employer, match }) => (
                  <JobRow
                    key={groupId}
                    id={match.opportunityVersionId}
                    title={title}
                    employer={employer}
                    access={match.sourceAccess}
                  >
                    <strong>
                      {match.score === null
                        ? "Score unavailable"
                        : `${String(match.score)}% match`}
                    </strong>
                  </JobRow>
                ))}
              </ul>
            )}
            <Pagination
              page={page}
              hasMore={items.length === recommendationPageSize}
            />
          </>
        )}
      </DataView>
    </main>
  );
}

export function JobCatalogPage() {
  const jobs = useJobs();
  const page = usePage();
  const load = useCallback(
    (signal: AbortSignal) => jobs.listJobs(page, signal),
    [jobs, page],
  );
  const state = useJobRead(`catalog-${String(page)}`, load);
  return (
    <main className="page-content jobs-page">
      <h1>Job catalog</h1>
      <JobNav />
      <DataView state={state}>
        {({ items, page, pageSize, total }) => (
          <>
            {items.length === 0 ? (
              <p>No opportunities on this page.</p>
            ) : (
              <ul className="job-list">
                {items.map(
                  ({
                    opportunityId,
                    title,
                    employer,
                    sourceAccess,
                    status,
                  }) => (
                    <JobRow
                      key={opportunityId}
                      id={opportunityId}
                      title={title}
                      employer={employer}
                      access={sourceAccess}
                    >
                      <span>{status}</span>
                    </JobRow>
                  ),
                )}
              </ul>
            )}
            <Pagination page={page} hasMore={page * pageSize < total} />
          </>
        )}
      </DataView>
    </main>
  );
}

function JobDetail({
  offer,
  match,
}: {
  offer: Job;
  match: Recommendation | null;
}) {
  const url = URL.canParse(offer.source.reference)
    ? new URL(offer.source.reference)
    : null;
  const sourceLink =
    url &&
    (url.protocol === "https:" || url.protocol === "http:") &&
    !url.username &&
    !url.password;
  const sourceDate =
    offer.source.kind === "manual"
      ? offer.source.capturedAt
      : offer.source.observedAt;
  const metadata = [offer.employer, offer.location].filter(Boolean).join(" · ");
  return (
    <>
      <h1>{offer.title}</h1>
      {metadata && <p>{metadata}</p>}
      <div className="job-row-meta">
        <SourceBadge access={offer.sourceAccess} />
        <span>
          Version {offer.version} · {offer.status}
        </span>
      </div>
      <section className="job-panel">
        <h2>Opportunity</h2>
        <p>{offer.description ?? "Full description unavailable."}</p>
        <p>
          {sourceLink ? (
            <a href={url.href} target="_blank" rel="noreferrer">
              View source
            </a>
          ) : (
            offer.source.reference
          )}
          {" · "}
          <time dateTime={sourceDate}>{sourceDate.slice(0, 10)}</time>
        </p>
        <dl className="job-facts">
          <dt>Stated by the source</dt>
          <dd>{offer.evidence.statedFields.join(", ") || "None recorded"}</dd>
          <dt>Inferred</dt>
          <dd>{offer.evidence.inferredFields.join(", ") || "None recorded"}</dd>
          <dt>Unknown fields</dt>
          <dd>{offer.evidence.unknownFields.join(", ") || "None recorded"}</dd>
        </dl>
      </section>
      <section className="job-panel">
        <h2>Match explanation</h2>
        {match ? (
          <MatchExplanation recommendation={match} />
        ) : (
          <p>No match explanation for this version yet.</p>
        )}
      </section>
    </>
  );
}

export function JobDetailPage() {
  const jobs = useJobs();
  const { id = "" } = useParams();
  const load = useCallback(
    async (signal: AbortSignal) => {
      const offer = await jobs.getJob(id, signal);
      const match = await jobs.getRecommendation(offer, signal);
      return { offer, match };
    },
    [id, jobs],
  );
  const state = useJobRead(`job-${id}`, load);
  return (
    <main className="page-content jobs-page">
      <JobNav />
      <DataView state={state}>
        {({ offer, match }) => <JobDetail offer={offer} match={match} />}
      </DataView>
    </main>
  );
}
