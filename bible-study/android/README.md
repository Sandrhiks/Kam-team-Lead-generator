# Bible Study Guide for Android (APK)

The Android app is a **Trusted Web Activity**: it opens the GitHub Pages site
(`https://sandrhiks.github.io/Kam-team-Lead-generator/`) full screen in Chrome,
with its own icon and name. Because it is the same site, it updates by itself
whenever the site changes, sign-in and progress are shared with the web version,
and daily reminders keep working (they show as notifications from the app).

Download link for members (always the newest build):

**https://github.com/Sandrhiks/Kam-team-Lead-generator/releases/latest/download/kam-bible-study.apk**

On the phone: open the link, download, tap the file, then **Install**. Android may
ask once to allow installs from Chrome or Files. The phone needs Chrome (or
another browser that supports Trusted Web Activities) installed.

## One-time setup

### 1. Add the signing key to GitHub

Android only installs an update if it is signed with the same key as the version
already installed, so the app uses one key forever. Keep a copy of the `.jks`
file and its password somewhere safe (a password manager). If you lose it,
members have to uninstall and reinstall to get updates.

In the repo: **Settings → Secrets and variables → Actions → Secrets → New repository secret**, add:

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | the key file, base64-encoded (one long line) |
| `ANDROID_KEYSTORE_PASSWORD` | the key's password |
| `ANDROID_KEY_ALIAS` | `kbs` |

To make your own key instead (needs Java):

```sh
keytool -genkeypair -keystore kbs.jks -alias kbs -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Kam Team"
base64 -w0 kbs.jks > kbs.jks.base64.txt   # macOS: base64 -i kbs.jks -o kbs.jks.base64.txt
```

### 2. Build it

Open **Actions → Bible Study Android app → Run workflow**. Later changes under
`bible-study/android/` build and publish by themselves. Each run creates a
release named *Bible Study Android app 1.0.N* with `kam-bible-study.apk`.

### 3. Hide the address bar (Digital Asset Links)

Until Chrome can confirm the site and the app belong together, the app shows a
small address bar at the top. Chrome looks for the proof at the **root** of the
domain, `https://sandrhiks.github.io/.well-known/assetlinks.json`, which this
repo can't publish (it's a project site in a folder). To add it:

1. Create a new public repository named exactly **`Sandrhiks.github.io`**.
2. Add the file `.well-known/assetlinks.json` with the contents from the latest
   release (the `assetlinks.json` file, also shown in the workflow run summary).
3. Add an empty file named `.nojekyll` (otherwise GitHub skips the `.well-known` folder).
4. In that repo, **Settings → Pages**, publish from the `main` branch.

If you move the app to your own domain, change `siteHost` and `sitePath` in
`app/build.gradle`, and put `assetlinks.json` at that domain's
`/.well-known/assetlinks.json` instead.

## Publishing on Google Play (optional)

Play needs an Android App Bundle (`gradle bundleRelease`) and a developer
account. Play App Signing re-signs the app with Google's key, so add that key's
SHA-256 fingerprint (Play Console → App integrity) to `assetlinks.json` as well.
