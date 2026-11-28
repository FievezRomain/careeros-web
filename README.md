# CareerOS Web

User interface for profiles, job discovery, tailored resumes, ATS reports and application tracking.

## Scope

- **Owns:** Presentation state and browser-side interaction only.
- **Inputs:** Versioned APIs exposed by the CareerOS services.
- **Outputs:** Explicit user commands; no autonomous application submission.
- **Dependencies:** identity, profile, job, matching, resume, ATS, application, communication and analytics services.

## Safety baseline

This public repository must never contain secrets, real resumes, real applications or personal data. External communication and application submission always require explicit user approval.

## Documentation

See [docs/overview.md](docs/overview.md) and the central [CareerOS workspace](https://github.com/FievezRomain/careeros-workspace).

## Local development

CareerOS Web is a React/TypeScript SPA built with Vite. It requires Node.js 22.12 or newer.

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

Configure the public OIDC authority, client identifier, redirect URIs and versioned profile API
base URL. The browser client uses Authorization Code with PKCE and never has a client secret.
OIDC user and transaction state use `sessionStorage`, so closing the browser session removes local
authentication state.

The Jobs views require the OIDC scopes `jobs:read` and
`matching:recommendations:read`. Route `/api/jobs` and `/api/matching` through
the same-origin gateway and strip each prefix. For browser-accessible service
gateways, set `VITE_JOB_API_BASE_URL` and `VITE_MATCHING_API_BASE_URL`.

Run `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test:coverage` and
`npm run build` before review.

## Status

Authenticated application shell with protected navigation and a profile onboarding/editor for
owned experiences, education and self-declared skills. The editor validates input before transport,
validates service responses at the adapter boundary and fails closed on authorization denial.

## License

Apache-2.0.
