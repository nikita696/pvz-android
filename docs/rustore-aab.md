# RuStore AAB Upload

RuStore accepts Android App Bundle only after the AAB signature setup is done in
RuStore Console.

## Files from CI

The `Android Release Artifacts` GitHub Actions workflow produces:

- `pvz-android-aab`: `app-release.aab`
- `pvz-android-uploadcert`: `uploadcert.pem`
- `pvz-android-apk`: `app-release.apk`

## RuStore Console steps

1. Open the app in RuStore Console.
2. Start uploading a new version and choose AAB.
3. In the `Signature not loaded` block, download the PEPK tool.
4. Copy the PEPK command from RuStore Console. It contains the app-specific
   encryption key.
5. Run the copied PEPK command against the release keystore and upload the
   generated `pepk_out.zip`.
6. Upload `uploadcert.pem` from CI.
7. Upload `app-release.aab` from CI.

## Important

For AAB, RuStore needs two signing materials before the bundle upload:

- encrypted app signing key archive from PEPK (`pepk_out.zip`);
- upload key certificate (`uploadcert.pem`) that matches the key used to sign
  the AAB.

The PEPK zip cannot be generated correctly without the unique encryption key
shown in the RuStore Console modal.
