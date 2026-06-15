# pvz-android

Minimal mobile schedule and payroll app for one PVZ.

Production preview: https://pvz-android.vercel.app

## What is inside

- Main screen is the work calendar.
- Add 2-3 employees with a daily rate.
- Tap an employee on a selected day to mark or remove a worked shift.
- Salary formula: `worked shifts in the selected month * daily rate - already paid`.
- Data is stored in Neon Postgres through Vercel API functions. No auth yet.

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

Production is intentionally restored from `main` without owner-login or invite blocking.

## Deploy note

Manual deploy trigger for employee color storage and day comment marker.
