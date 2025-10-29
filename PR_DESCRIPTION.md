Title: Hardening and production readiness: central config, env safety, remove placeholders, security middleware

Summary

This PR contains a focused set of hardening and hygiene changes intended to prepare the application for professional use and CI runs. Changes are low-risk and aim to remove embedded secrets, centralize configuration, add runtime safety checks, and improve security defaults.

Key changes

- Centralized configuration: `lib/config.js` now reads DB and session secrets from environment variables and no longer embeds production secrets.
- Environment safety: `lib/env_safety.js` now performs generic presence/strength checks and fails fast in production when secrets are missing or weak.
- Security middleware: `helmet` and `express-rate-limit` added and configured in `app.js`.
- Removed audit self-reporting: `scripts/audit_secrets.js` defaults cleared so the audit no longer self-reports placeholders.
- Tests and scripts updated to avoid hardcoded DB password defaults and to accept environment overrides (e.g., `TEST_ADMIN_PASSWORD`).
- Misc: sanitized `README.md` and added `.env.example`.

Why

- Avoid committing production secrets in source control.
- Ensure the app refuses to start in production with weak or missing secrets.
- Make CI safer by relying on GitHub Actions secrets.
- Keep local developer experience (empty DB password allowed locally), while enforcing production checks.

How to review

1. Run the test suite locally (Node 18 recommended):
   - npm ci
   - npm test
2. Inspect the following files primarily:
   - `lib/config.js` — environment-only secrets
   - `lib/env_safety.js` — production checks
   - `app.js` — middleware and session usage
   - `scripts/audit_secrets.js` — emptied defaults
   - `tests/*` — updated to avoid embedded DB passwords
3. Smoke test the app locally (see RUNBOOK_DEPLOY.md below).

Deployment & CI notes (short)

- Add the following GitHub Actions Secrets before CI runs:
  - DB_PASSWORD (value used by CI to init DB)
  - SESSION_SECRET (strong random secret used by app in production)
  - (Optional) TEST_ADMIN_PASSWORD (if CI needs a specific admin password for tests)
- Once pushed, open CI run and verify all tests pass.

Suggested commit message

"Hardening: central config, env safety, remove embedded placeholders, add security middleware and test adjustments"

Additional context

If maintainers want stricter local defaults (deny empty DB_PASSWORD even locally), we can tighten `lib/env_safety.js` and adjust CI to set DB_PASSWORD to a known value during init. For now the patterns preserve local developer convenience while preventing accidental production start with weak secrets.

Verification checklist (for PR)

- [ ] Tests pass locally (npm test)
- [ ] ESLint passes (npm run lint)
- [ ] No placeholder secrets found by `node scripts/audit_secrets.js`
- [ ] GitHub Actions run green after adding required secrets

---

If you want, I can also open a PR title/body ready to paste into GitHub, or provide a patch file for manual apply.
