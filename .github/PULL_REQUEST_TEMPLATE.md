## Summary

This PR contains a set of hardening changes: safer partial-update handlers, admin pages for system parameters and journaux viewer, concurrency and validation tests, and security hardening adjustments.

## Checklist
- [ ] Tests pass locally: `npm ci && npm test`
- [ ] Lint passes: `npm run lint`
- [ ] No sensitive data in the diff (run `node scripts/audit_secrets.js`)
- [ ] README / RUNBOOK updated if deployment or DB changes are required

## What changed
- Safer partial updates in admin endpoints to avoid lost updates under concurrency
- New admin pages: `parametres_systeme` and `journaux_systeme`
- Tests: concurrency/invalid case tests + parameter/journaux tests
- Minor view additions for admin pages

## How to test locally
1. Ensure you have MySQL 8 running and the DB created (see `database.sql`)
2. Set local env vars or copy `.env.example` to `.env`
3. Run:

```powershell
npm ci
npm run lint
npm test
```

## Notes
- CI (GitHub Actions) requires secrets: `DB_PASSWORD`, `SESSION_SECRET` (add via repo Settings -> Secrets)
- This PR does not modify DB schema; if you want optimistic locking, I can prepare a migration and example implementation in a follow-up PR.

---
