# CareerOS Web â€” service overview

## Responsibility

User interface for profiles, job discovery, tailored resumes, ATS reports and application tracking.

## Data ownership

Presentation state and browser-side interaction only.

## Interfaces

- Inputs: Versioned APIs exposed by the CareerOS services.
- Outputs: Explicit user commands; no autonomous application submission.
- Dependencies: identity, profile, job, matching, resume, ATS, application, communication and analytics services.

## Contract rules

- APIs and events are versioned.
- Consumers must be idempotent where retries are possible.
- Correlation identifiers are propagated without logging sensitive payloads.
- Authorization and ownership are checked at the service boundary.

## Non-goals

This service does not absorb responsibilities owned by another CareerOS service. Cross-service workflows are coordinated through explicit contracts rather than shared databases.

## Security and privacy

Persist the minimum data required, record provenance, define retention, redact logs and use synthetic examples in this public repository.