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
return path, and fails closed when restoration errors. Profile, Jobs, Resumes and Applications are
protected placeholders until their dedicated stories land.

## Contract rules

- APIs and events are versioned.
- Consumers must be idempotent where retries are possible.
- Correlation identifiers are propagated without logging sensitive payloads.
- Authorization and ownership are checked at the service boundary.

## Non-goals

This service does not absorb responsibilities owned by another CareerOS service. Cross-service workflows are coordinated through explicit contracts rather than shared databases.

## Security and privacy

Persist the minimum data required, record provenance, define retention, redact logs and use synthetic examples in this public repository.
