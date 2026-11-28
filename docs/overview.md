# CareerOS Web â€” service overview

## Responsibility

User interface for profiles, job discovery, tailored resumes, ATS reports and application tracking.

## Data ownership

Presentation state and browser-side interaction only.

## Interfaces

- Inputs: Versioned APIs exposed by the CareerOS services.
- Outputs: Explicit user commands; no autonomous application submission.
- Dependencies: identity, profile, job, matching, resume, ATS, application, communication and analytics services.

## Application shell and authentication

The React application is a public OIDC client. `OidcSession` is the only adapter that imports
`oidc-client-ts`; components depend on the local `SessionPort` through `AuthProvider`. This keeps
session restoration, sign-in, callback completion and sign-out replaceable and deterministic in
tests.

Authorization Code with PKCE is mandatory. No browser client secret exists. OIDC user and
transaction state are stored in `sessionStorage`, never in `localStorage`, and the UI receives only
the subject and display name rather than raw tokens. Provider failures are translated to stable
messages without logging authorization responses.

All `/app` routes are children of one authentication guard. The guard renders no private shell
while restoration is pending, redirects anonymous sessions to `/sign-in` with a validated local
return path, and fails closed when restoration errors. Resumes and Applications remain
protected placeholders until their dedicated stories land.

## Profile onboarding and editor

The protected `/app/profile` route loads owned profile facts through the local `ProfilePort`.
`HttpProfile` is the only profile HTTP adapter: it obtains the access token from an injected
`AccessTokenPort`, calls the versioned profile API and validates every successful response with Zod
before returning typed data to the UI. Components never receive or render the token.

The editor supports direct entry and correction of experiences, education items and self-declared
skills. It validates required fields, ISO dates, current-item state and chronological date ranges
before transport. Loading, empty, saved, validation, temporary-service and authorization-denial
states are explicit. A denied session clears the profile view and does not expose previously loaded
facts or provider details. Server-side authorization and ownership remain authoritative.

The same protected view exposes the account's active job-search criteria through the profile
port. A user can activate, update, pause or resume the daily search, see the immutable criteria
version and configure its IANA timezone and execution window. The initial values are explicitly
shown as `Europe/Paris`, `08:00`–`10:00`; they are defaults, not a hidden scheduler decision.
Every mutation carries a fresh idempotency key and every successful response is validated before
rendering. The UI also explains which profile changes request rematching; the profile service
remains authoritative for that classification.

## Job catalog and recommendations

`/app/jobs` preserves the matching service's recommendation order.
`/app/jobs/catalog` browses the owned job catalog and
`/app/jobs/:id` displays an immutable job version, source and evidence state.
The match explanation appears only when the evaluation uses the displayed
version. The service supplies the score, evidence, uncertainty and eligibility
reason. The browser keeps the access token in the HTTP adapter and validates
each response before rendering. Denied requests display a generic error.

## Resume preview and approval

An eligible recommendation offers **Create resume** in its list and detail
views. The action sends the evaluation and pinned source identifiers. The
review shows missing requirements, a protected PDF preview and an explicit
approval for that version. Stale facts require refreshed recommendations.

The browser calls the resume API through `/api/resume` by default or
`VITE_RESUME_API_BASE_URL`. Configure `resume:drafts:generate`,
`resume:versions:read`, `resume:versions:write` and
`resume:versions:approve` in the identity provider.

## Contract rules

- APIs and events are versioned.
- Consumers must be idempotent where retries are possible.
- Correlation identifiers are propagated without logging sensitive payloads.
- Authorization and ownership are checked at the service boundary.

## Non-goals

This service does not absorb responsibilities owned by another CareerOS service. Cross-service workflows are coordinated through explicit contracts rather than shared databases.

## Security and privacy

Persist the minimum data required, record provenance, define retention, redact logs and use synthetic examples in this public repository.
