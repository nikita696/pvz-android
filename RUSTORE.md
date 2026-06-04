# RuStore Release Checklist

## Android build config

- App name: `PVZ Android`
- Package name: `ru.nickrimer.pvzandroid`
- Version name: `1.0.0`
- Version code: `1`
- Release file options:
  - EAS preview APK: `eas build -p android --profile preview`
  - APK for device testing: `npm run build:rustore:apk`
  - AAB for store release: `npm run build:rustore:aab`

## Local debug APK

Use this only on a machine with JDK 17 and Android SDK installed.

```powershell
npx expo prebuild --platform android --clean --no-install
cd android
./gradlew assembleDebug --stacktrace --info --no-daemon --console=plain
```

Expected APK path:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

On Windows PowerShell from the repository root:

```powershell
cd android
.\gradlew.bat assembleDebug --stacktrace --info --no-daemon --console=plain
```

Do not repeatedly restart Gradle/Kotlin without a new error log. If the build stalls before `android/app/build`, prefer EAS Build or GitHub Actions.

## EAS Build

Preferred APK path for this Expo/React Native app:

```powershell
eas build -p android --profile preview
```

If the CLI is not logged in, run `eas login` or set `EXPO_TOKEN`.

## Before upload

- Build and install the APK on a real Android device.
- Keep the signing key safe. Future APK updates must use the same signature.
- For every new RuStore release, increase `expo.android.versionCode` in `app.json`.
- If uploading AAB, upload the app signing files in RuStore Console before the AAB.
- Upload 1 to 10 phone screenshots in RuStore Console.

## API secrets

Keep RuStore API credentials only in `.secrets/rustore.env`; it is ignored by Git and is not loaded by Expo web builds.

Required keys:

- `RUSTORE_PRIVATE_KEY`
- `RUSTORE_KEY_ID`
- `RUSTORE_PACKAGE_NAME`
- `RUSTORE_DEV_VK_ID`
- `RUSTORE_CONTACT_EMAIL`

Useful checks:

- `npm run rustore:auth`
- `npm run rustore:versions`
- `npm run rustore:draft`

## RuStore upload requirements checked

- RuStore accepts signed APK and AAB files.
- APK/AAB size limit is 5 GB.
- Package name must be unique.
- Subsequent releases must keep the same package and use a higher version code.

## Current API limitation

RuStore API requires the generated key to have access to the selected app and upload/publication methods. If the API returns `This user does not have rights to perform this action`, update the key in RuStore Console:

- bind the key to `ru.nickrimer.pvzandroid` or all apps;
- enable upload/publication methods for app versions, APK/AAB files, icons, screenshots, and moderation;
- make sure the app exists in RuStore Console. The upload API requires at least one active version in the console.
