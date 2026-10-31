# SmartWater Zambia — Android app

Kotlin + Jetpack Compose client for the shared SmartWater API
(`https://majismart-api.onrender.com`).

- **Sign-in**: email/password or Google, both exchanged for the same JWT the web
  dashboard uses. The token is stored in `SharedPreferences` and attached to
  every request by an OkHttp interceptor.
- **Report tab**: captures a high-accuracy GPS fix and a leak photo, then posts
  both in one request to `POST /api/reports`.
- **Role aware**: the header shows the role the API returned. Administrator-only
  management lives on the web dashboard.

---

## 1. Open the project

In Android Studio: **File → Open** → select the **`APP/android`** folder
(not the repository root). Let Gradle sync finish; it downloads the Android
Gradle Plugin, Compose and Play Services on first run.

Requirements: Android Studio Koala/Ladybug or newer (bundled JDK 17),
Android SDK 35, an emulator or device with **Google Play Services**.

## 2. Run it

Press **Run ▶** with the `app` configuration. Nothing else is needed — the build
already defaults to:

| BuildConfig | Default |
|---|---|
| `API_BASE_URL` | `https://majismart-api.onrender.com/` |
| `GOOGLE_WEB_CLIENT_ID` | the project's Web OAuth client |

Sign in with the seeded accounts:

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@majismart.zm` | `MajiAdmin-961b1cab-2026!` |
| Customer | `mwape@community.zm` | `MajiCustomer-00136b8b-2026!` |

> The free API sleeps after 15 minutes idle. The first request can take up to a
> minute — the app already waits 90 s, so just let the spinner run.

### Against a local API instead

```bash
./gradlew installDebug -PapiBaseUrl=http://10.0.2.2:5000/     # emulator → host
./gradlew installDebug -PapiBaseUrl=http://192.168.1.20:5000/ # device on the same Wi-Fi
```

## 3. Google sign-in — the one manual step

Google verifies **which app** is asking by pairing the package name with the
signing certificate's SHA-1. Until that pair exists in Google Cloud, the Google
button returns `ApiException` code 10 (`DEVELOPER_ERROR`). Email/password works
regardless.

1. **Get the SHA-1 of the keystore you run with.**

   Android Studio → right sidebar **Gradle** → `MajiSmartZambia → Tasks →
   android → signingReport`, or in the Terminal:

   ```bash
   ./gradlew signingReport        # macOS/Linux
   gradlew.bat signingReport      # Windows
   ```

   Copy the **SHA1** under `Variant: debug` (the debug keystore, typically
   `~/.android/debug.keystore`).

2. **Register the Android client** — Google Cloud Console → your project →
   **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Android**
   - Name: `SmartWater Android`
   - Package name: `com.majismart.zambia`
   - SHA-1: paste the fingerprint from step 1
   - **Create**

3. Run the app again → **Continue with Google** → pick the account.

Notes:

- The downloaded `client_secret_*.json` from Google Cloud is **not used** by this
  app. No secret is shipped to a mobile client; the backend verifies Google's
  signed ID token instead. Only the *Web* client id matters, and it is already
  compiled in.
- Running a **release** build? Add a second Android client for that keystore's
  SHA-1, otherwise Google sign-in fails only in release.
- Emulators without Google Play Services cannot do Google sign-in at all — use a
  "Google Play" system image or a real device.

## 4. Maps (optional)

The Live Map and the location picker use the Google Maps SDK. Without a key the
map tiles stay blank (no crash) while GPS capture, reporting and sign-in keep
working. To enable:

1. Google Cloud → **APIs & Services → Library** → enable **Maps SDK for Android**.
2. **Credentials → Create credentials → API key** → restrict it to
   *Android apps* with package `com.majismart.zambia` + the same SHA-1.
3. Build with `-PmapsApiKey=AIza...` or put
   `mapsApiKey=AIza...` in `~/.gradle/gradle.properties`.

## 5. Release build

```bash
./gradlew bundleRelease -PapiBaseUrl=https://majismart-api.onrender.com/ -PmapsApiKey=AIza...
```

You need a keystore (`signingConfigs`) and, for Google sign-in, an Android OAuth
client registered against that keystore's SHA-1.

## 6. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `DEVELOPER_ERROR` (code 10) on Google sign-in | Package name or SHA-1 mismatch — redo §3 with the fingerprint of the keystore actually used |
| Google popup says "app not verified" | OAuth consent screen is in **Testing**; add the account under **Test users** or publish the app |
| "Google sign-in is not configured in this build" | `GOOGLE_WEB_CLIENT_ID` empty — rebuild with `-PgoogleWebClientId=...` |
| `Network error` / long spinner | Free API cold start (up to ~60 s); retry after a minute |
| Map is grey | No Maps SDK key (§4) |
| "Cannot reach the SmartWater API" | Check `API_BASE_URL`; cleartext HTTP only works for `10.0.2.2` / `localhost` |
| Signed in as the wrong person after switching accounts | Sign out in the header (top-right) and sign in again |

## Project layout

```
app/src/main/java/com/majismart/zambia/
├── MainActivity.kt          # AuthGate (login ↔ app), splash, bottom navigation
├── auth/AuthManager.kt      # session store, password + Google exchange, sign-out
├── data/model/              # API models (Tank, CommunityReport, AuthUser, ...)
├── data/remote/             # Retrofit service + auth interceptor
├── ui/screens/              # LoginScreen, HomeScreen, SubmitReportScreen, ...
├── ui/components/           # header, maps, gauges, location picker
└── notifications/           # local notification helper
```
