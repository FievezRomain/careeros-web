# Security Policy

CareerOS is developed in public, but personal data and secrets are never public artifacts.

## Reporting a vulnerability

Do not open a public issue containing exploitable details. Use GitHub private vulnerability reporting when available, or contact the maintainer through a private channel.

## Repository rules

- Never commit tokens, passwords, OAuth credentials, private keys, real CVs, real applications or personal contact data.
- Use environment variables or a dedicated secret store. Public examples contain placeholders only.
- Keep GitHub Actions permissions minimal and review third-party actions before use.
- Use fictitious, non-identifying fixtures in tests and documentation.
- Revoke and rotate any credential immediately if exposure is suspected.
- The SPA is a public OIDC client using Authorization Code with PKCE; never configure a client
  secret in `VITE_*` variables or browser code.
- Store OIDC state only in `sessionStorage`. Do not place access tokens in URLs, logs, rendered
  markup, analytics events or `localStorage`.
- Validate post-authentication return paths as local protected routes to prevent open redirects.
- Keep profile API tokens inside injected adapters. Presentation components receive typed owned
  facts only, and successful API payloads are runtime-validated before rendering.
