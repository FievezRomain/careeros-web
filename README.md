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

Configure only the public OIDC authority, client identifier and redirect URIs. The browser client
uses Authorization Code with PKCE and never has a client secret. OIDC user and transaction state
use `sessionStorage`, so closing the browser session removes local authentication state.

Run `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test:coverage` and
`npm run build` before review.

## Status

Authenticated application shell with protected navigation, provider-neutral OIDC session adapter
and automated quality gates. Feature pages remain intentionally incremental.

## License

Apache-2.0.
