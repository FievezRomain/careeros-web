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

## Status

Architecture and security baseline. Functional implementation will be added incrementally with tests and versioned contracts.

## License

Apache-2.0.