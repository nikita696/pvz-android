# RuStore Release Checklist

## Android build config

- App name: `PVZ Android`
- Package name: `ru.nickrimer.pvzandroid`
- Version name: `1.0.0`
- Version code: `1`
- Release file options:
  - APK for device testing: `npm run build:rustore:apk`
  - AAB for store release: `npm run build:rustore:aab`

## Before upload

- Build and install the APK on a real Android device.
- Keep the signing key safe. Future APK updates must use the same signature.
- For every new RuStore release, increase `expo.android.versionCode` in `app.json`.
- If uploading AAB, upload the app signing files in RuStore Console before the AAB.
- Upload 1 to 10 phone screenshots in RuStore Console.

## RuStore upload requirements checked

- RuStore accepts signed APK and AAB files.
- APK/AAB size limit is 5 GB.
- Package name must be unique.
- Subsequent releases must keep the same package and use a higher version code.
