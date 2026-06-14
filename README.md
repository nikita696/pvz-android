# pvz-android

Minimal mobile schedule and payroll app for one PVZ.

Production preview: https://pvz-android.vercel.app

## What is inside

- Main screen is the work calendar.
- Add 2-3 employees with a daily rate.
- Tap an employee on a selected day to mark or remove a worked shift.
- Salary formula: `worked shifts in the selected month * daily rate - already paid`.
- Public builds store data locally on the device. A fresh install starts empty and does not connect to Nick's private production data.
- Public Android builds do not request `android.permission.INTERNET`.
- Owner-sync builds can connect to the shared PVZ database after owner sign-in.

## Environment

No server environment is required for the public app.

Owner-sync builds are separate from public RuStore builds:

```bash
EXPO_PUBLIC_PVZ_SYNC_MODE=owner
EXPO_PUBLIC_API_BASE_URL=https://your-vercel-url
```

The deployed owner-sync API needs:

```bash
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
PVZ_OWNER_PASSWORD=owner-password
```

Do not enable `EXPO_PUBLIC_PVZ_SYNC_MODE=owner` for a public RuStore release.

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
