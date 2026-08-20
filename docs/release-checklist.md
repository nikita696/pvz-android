# Release checklist

Keep releases boring and reversible. This application holds payroll-like data even though it is intentionally small.

## Code and tests

- [ ] `npm ci` completes with the committed lockfile.
- [ ] `npm run check` passes: TypeScript, ESLint, unit tests, and Expo web export.
- [ ] `npm run test:e2e` passes the onboarding, calendar, payment, deletion-undo, backup, and mobile-layout flows.
- [ ] `public/version.json` matches the native app version in `app.json` and has the intended minimum supported version.
- [ ] The previous production deployment or APK is still available for rollback.

## Server boundary

- [ ] Anonymous `GET /api/state` returns `401`.
- [ ] Anonymous `POST /api/state` returns `401` and does not change state.
- [ ] A random Bearer token returns `401`.
- [ ] A valid team session reads only its workspace.
- [ ] Public workspace creation remains disabled.
- [ ] The invite endpoint is rate-limited before a broadly advertised Store release.
- [ ] The built-in `tokyo` compatibility code is not treated as a secret; rotate/remove it before public promotion if access is no longer limited to the trusted team.

## Secrets and data safety

- [ ] Production has `DATABASE_URL`, `CRON_SECRET`, `PVZ_INVITE_CODE`, and `PVZ_DEFAULT_WORKSPACE_ID` only in server-side environment variables.
- [ ] No database URL, session token, signing key, or secret value appears in the JS bundle, logs, screenshots, or commit diff.
- [ ] The daily backup cron succeeds and the newest snapshot has plausible employee/shift/payment counts.
- [ ] Manual export fetches fresh server state before producing the file.
- [ ] Restore shows record counts and creates a server snapshot before replacement.

## Production smoke test

- [ ] Connect on a clean browser/device using the intended team code.
- [ ] Confirm the correct PVZ name and employee list before making any mutation.
- [ ] Add and undo a disposable test shift, then verify the result from a second client.
- [ ] Confirm the sync indicator, current local date, signed balance, and version check.
- [ ] Review runtime logs for unexpected `401`, `409`, `500`, or timeout bursts.
