# pvz-android

Minimal mobile schedule and payroll app for one three-person PVZ team.

Production preview: https://pvz-android.vercel.app

## What is inside

- Main screen is the work calendar.
- Add 2-3 employees with a daily rate.
- Tap an employee on a selected day to mark or remove a worked shift.
- Salary is a signed cumulative balance: accrued shifts minus payouts and deductions.
- Historical shifts use the employee rate that was effective on the shift date.
- Data is stored in Neon Postgres through authenticated Vercel API functions.
- Successful server responses are also kept as a last-known local recovery snapshot.

## Access and security model

- A shared team code creates an opaque workspace session token.
- `/api/state` requires that token for both reads and writes; the APK does not connect to Neon directly.
- Creating arbitrary workspaces is disabled in the public client flow.
- The shared code is a convenience gate for a tiny trusted team, not user identity or a strong public-store secret.
- Never place `DATABASE_URL`, `CRON_SECRET`, session tokens, or signing keys in source files or public Expo variables.

Before publishing a broadly advertised Store build, follow [the release checklist](docs/release-checklist.md).

## Environment

Create `.env.local` for local Vercel/API work:

```bash
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
```

For Expo Go or Android builds that call a deployed backend, set:

```bash
EXPO_PUBLIC_API_BASE_URL=https://your-vercel-preview-or-prod-url
```

The native app defaults to `https://pvz-android.vercel.app` when this variable is not set.
The deployed API needs `DATABASE_URL` in Vercel before it can store schedule data.

## Commands

```bash
npm install
npm run typecheck
npm run lint
npm run test
npm run test:e2e
npm run build
```

For local Android preview:

```bash
npm run android
```

For web preview:

```bash
npm run web
```

## Recovery note

Neon keeps automatic server snapshots, manual JSON export remains available, and the client stores the last successfully received state locally. A manual export should fetch a fresh server state first; `fetchFreshStateForBackup()` exists for that flow.

The local snapshot is recovery support, not an offline write queue. When the server cannot be reached, do not silently upload or merge stale local data.

## Web version check

The web build publishes `/version.json`. The client helper `checkAppVersion()` compares the running version with the latest and minimum supported versions without exposing secrets.

## Deploy note

`npm run build` copies the PWA manifest, icons, service worker, and public version manifest into `dist`.
