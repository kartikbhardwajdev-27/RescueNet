# RescueNet Android app: build, install, connect

The app is an **APK** you install on an Android phone by hand ("sideloading"), not
from the Play Store. It is the same screens as the website, packed into the app,
together with the **offline map**. For live data (incidents, shelters, events, login,
reports, SOS) it talks to the RescueNet server running on **your laptop**.

Paths are relative to `app/` unless they start with `docs/`.

**Read this first: this build has not been run on a phone.** I built the APK and
checked what is inside it, and I ran the same screens in a desktop browser against a
real server, but there was no phone or emulator in my environment. The list of what
that leaves untested is in [What is not verified](#what-is-not-verified). Please do
the phone test in `docs/TEST_CHECKLIST.md` (Part 3) before you rely on it.

## What works where

| | Laptop on | Laptop off or unreachable |
| --- | --- | --- |
| Map (tiles, glyphs, icons) | yes, from inside the app | **yes**, from inside the app |
| Resources, About, guides | yes | **yes** |
| Home, Map markers, Shelters, Events | live (refreshes every 30 s while open) | the **last copy the phone saved**, with "Saved data from <time>, not live" |
| Report and SOS | sent at once | **saved on the phone and sent when the laptop is reachable**, each exactly once, SOS first |
| Login, "My reports", "My events", one incident's page | yes | need the laptop (saved copies are kept only for the four public lists above) |
| Road directions to a shelter ("Navigate to nearest shelter", Navigate on a shelter) | yes, worked out on the phone from the road file inside the app | **yes**, using the saved shelter and incident lists (see the "not live" banner); limits in [`NAVIGATION.md`](NAVIGATION.md) |
| Location (SOS, reports, "My location") | Android location permission | same, it does not need the laptop |

"Offline" here means **no internet**. The phone still has to reach the laptop for live
data: same WiFi, or the phone on the laptop's hotspot.

## 1. Run the server on the laptop

```sh
cd ~/Documents/Desktop/RescueNet/app
npm run build          # after any change to the code
npm run start:lan      # prints the address to type into the phone
```

`npm run start:lan` prints something like `http://192.168.1.6:3000`. That is the
**laptop address**. `npm run lan:url` prints it again without starting anything. It
changes when the laptop joins a different network.

- MongoDB must be running (`docs/README_APP.md`).
- The first time, macOS may ask "Do you want node to accept incoming network
  connections?". Allow it, or the phone cannot reach the laptop.
- The server stays `http://`, not `https://`. See [Security](#security-trade-offs).

## 2. Build the APK (once per laptop, then one command)

### 2a. Tools (one time, no Homebrew, no Android Studio)

Everything lives in `~/dev`, outside the repo. These are the exact versions used for
this build and what they cost on disk. (Capacitor 8 needs JDK 21, Gradle 8.14.3,
Android Gradle Plugin 8.13.0 and Android 16 / API 36.)

| What | Where it came from | Download | On disk |
| --- | --- | --- | --- |
| JDK 21 (Eclipse Temurin 21.0.13, macOS arm64 `.tar.gz`) | adoptium.net | 200 MB | 335 MB |
| Android command-line tools 23.0 (`commandlinetools-mac_arm64-16111833_latest.zip`) | dl.google.com | 155 MB | 172 MB |
| SDK packages `platform-tools` (16 MB), `platforms;android-36` (66 MB), `build-tools;36.0.0` (79 MB) | `sdkmanager` | 161 MB | 359 MB |
| `build-tools;35.0.0`, which Gradle installs by itself on the first build | `sdkmanager`, run by Gradle | 77 MB | 186 MB |
| Gradle 8.14.3 (the project's wrapper downloads it by itself) | services.gradle.org | 225 MB | 488 MB |
| Libraries Gradle fetches on the first build (including Google Play services location) | Google Maven, Maven Central | not measured | 756 MB |

Downloads add up to about **0.8 GB plus the Gradle libraries**, and the tools take
about **2.3 GB** on disk (the downloaded archives in `~/dev/downloads`, another
350 MB, can be deleted). You need the internet for this once. Afterwards a build
needs no network.

```sh
mkdir -p ~/dev/downloads ~/dev/jdk ~/dev/gradle-home ~/dev/android-sdk/cmdline-tools

# 1. JDK 21: download the macOS aarch64 .tar.gz from https://adoptium.net/temurin/releases/?version=21
tar -xzf ~/dev/downloads/OpenJDK21U-jdk_aarch64_mac_hotspot_*.tar.gz -C ~/dev/jdk

# 2. Android command-line tools: "Command line tools only" on https://developer.android.com/studio
unzip ~/dev/downloads/commandlinetools-mac_*_latest.zip -d ~/dev/cmdtools
mv ~/dev/cmdtools/cmdline-tools ~/dev/android-sdk/cmdline-tools/latest && rmdir ~/dev/cmdtools

# 3. Licences and packages
export JAVA_HOME=$(echo ~/dev/jdk/jdk-21*/Contents/Home)
export ANDROID_HOME=~/dev/android-sdk
yes | ~/dev/android-sdk/cmdline-tools/latest/bin/sdkmanager --licenses
~/dev/android-sdk/cmdline-tools/latest/bin/sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"
```

If macOS refuses to run the downloaded tools ("cannot be verified"), run
`xattr -dr com.apple.quarantine ~/dev/jdk ~/dev/android-sdk` once.

`npm run apk` finds these by itself in `~/dev` (or in `JAVA_HOME` / `ANDROID_HOME` if
you set them) and keeps Gradle's downloads in `~/dev/gradle-home` when that folder
exists. Check an install with `npx cap doctor`.

### 2b. Build

You need the offline map file first (`docs/OFFLINE_MAP.md`:
`public/maps/tricity.pmtiles`, about 4 MB). It is not in git, and the build stops
with a message if it is missing. The **road file for directions**
(`public/routing/tricity-roads.rnrg`, 1.4 MB, with its `meta.json`) **is** in git; the
build checks it is there and intact, and stops if it is missing, damaged, or over 40 MB
(it would not be bundled without asking: `docs/NAVIGATION.md`).

```sh
cd ~/Documents/Desktop/RescueNet/app
npm run apk -- --offline
```

`-- --offline` tells Gradle it may not touch the network (it uses the libraries saved by
the first build), so nothing leaves the laptop. Leave it out only on the very first
build, which has to download them.

This runs `npm run build:mobile` (the UI as a static export, `app/out`), copies it
into the Android project (`npx cap sync android`) and compiles it with Gradle, then
copies the result to **`app/dist/RescueNet.apk`** (about 22 MB) and prints its size and
checksum. It then **opens the APK and checks what is inside** (the pages, the map, the road
file and its `meta.json`, the manifest) and stops if anything is missing. It takes under a
minute once the tools are downloaded.

- It is a **debug** build, signed with the standard Android debug key that Gradle
  keeps in `~/.android`. That is fine for installing on your own phones. It is not
  a release build for the Play Store; no release key exists.
- **Do not commit the APK, any keystore, or the SDK.** `app/dist` is git-ignored. I
  cannot edit `.gitignore` under this project's rules, so keep keystores outside
  the repo.
- `npm run build:mobile` alone only makes `app/out`. The website's `npm run build`
  and `npm start` are unchanged by all of this.

## 3. Install it on a phone

Get `RescueNet.apk` onto the phone. Any one of these:

- **Cable and `adb`** (needs USB debugging on in the phone's Developer options):
  `~/dev/android-sdk/platform-tools/adb install -r ~/Documents/Desktop/RescueNet/app/dist/RescueNet.apk`
  (`-r` keeps the app's data when you update it).
- **Over the same WiFi, no cloud:** `cd ~/Documents/Desktop/RescueNet/app/dist &&
  python3 -m http.server 8000`, then on the phone open
  `http://<laptop address without :3000>:8000/RescueNet.apk` in the browser and
  download it. Stop the command (Ctrl+C) afterwards.
- A USB cable in "File transfer" mode, a messaging app, or a drive. Anything that
  gets the file onto the phone.

Then open the file on the phone (the **Files** or **Downloads** app, or the
browser's download notification):

1. **Allow installing from this source.** Android blocks installing apps from
   anywhere but the Play Store until you allow the app you opened the file with (Files,
   Chrome...) to **install unknown apps**. It shows a prompt with a **Settings**
   button; switch on **Allow from this source**, press back, and continue. (On
   older Android versions the switch is one global **Unknown sources** setting.)
2. **Play Protect may warn you.** Google Play Protect checks apps from outside the
   Play Store, and an app it has not seen before gets a warning such as "Unsafe app
   blocked" or "Scan app with Play Protect?". RescueNet is a debug build signed with
   a debug key, which is exactly what it distrusts. Choose **More details**, then
   **Install anyway** (or **Install without scanning**). The wording and the buttons
   differ between Android versions and phone makers. This is expected, it does not
   mean the file is damaged. Install only an APK you built yourself.
3. Press **Install**, then **Open**.

To update: build again, then install the new file over the old one. That only works
if both were built on the same laptop (same debug key); otherwise uninstall first.

## 4. Connect the app to the laptop

On first launch the app shows **Connect to the laptop**:

1. Start the server on the laptop (`npm run start:lan`) and put the phone on the same
   WiFi, or on the laptop's hotspot.
2. Type the address it printed, for example `http://192.168.1.6:3000`.
3. Press **Test**. "Connected. RescueNet answered and its database is ready." means
   it works. Other answers say what is wrong: it could not reach the address (wrong
   WiFi? server not running? firewall?), something else answered, or the database is
   not running.
4. Press **Save and continue**. (**Skip for now** opens the app with no laptop: the
   map and the guides work, reports and SOS are saved for later.)

Change it later in **Settings** (the "More" menu, top right). **Changing the address
logs you out and clears the saved data**, so a login is never sent to a different
server.

The app accepts `http://` only for addresses on a private network (`192.168.x.x`,
`10.x.x.x`, `172.16-31.x.x`, `localhost`, `*.local`). For anything else it requires
`https://`. No username, password or path in the address.

## Security trade-offs

Full detail in `docs/SECURITY.md`, section "The Android app". In short:

- **Cleartext http is allowed** (Android blocks it by default) because the laptop has
  no certificate. Anyone on the same WiFi could read or alter what travels between
  phone and laptop, including the login. Use your own hotspot or a network you trust.
- **Login is a token** kept on the phone (not a cookie). It is not encrypted. Logging
  out removes it from the phone; it cannot be cancelled on the server and expires
  after 7 days.
- **Debug build:** other people with a cable and USB debugging could inspect the
  app. Do not hand a phone with a logged-in session to someone you do not trust.
- The app contacts **only** the laptop address you saved. Its own files, fonts and map
  are inside it, and its pages have a Content-Security-Policy that forbids anything
  else.

## What is not verified

I did **not** run the APK on a phone or emulator. What I did check, and how:

- **APK contents** (`aapt2`, `apksigner`, `unzip`): package `in.rescuenet.app`, Android
  7.0+ (API 24), target API 36, location and internet permissions, cleartext allowed,
  backups off, debug-signed, the pages, the 3.7 MB map and 1,000+ map font/sprite files
  inside, no API route files. Since Step 26 also the **1.4 MB road file**, with the same
  SHA-256 as `app/public/routing/`, and the routing worker script.
- **Directions in the app's files** (headless Chrome, the exact `app/out` export, the
  server then blocked): a route from the saved shelter and incident lists, the "not live"
  banner, the routing worker running as a real Web Worker, "Start" following a faked
  position. **Not verified:** Android's WebView running the worker and IndexedDB, Android's
  file server serving the road file, the speed on a phone, real GPS (checklist section 16).
- **Lesson from the road file:** Android's build tools unzip any asset whose name ends in
  `.gz` and drop that extension. The road file was first called `.bin.gz` and would have
  been missing on the phone with no error; it is now `tricity-roads.rnrg`, and `npm run
  apk` fails if it is not inside the APK.
- **The same screens** (the exact `app/out` export) in headless Chrome against a real
  production server, with a stand-in for the phone's native layer (the Capacitor
  plugins fall back to browser equivalents there): first-run screen, address
  validation, Test, login by token, staying logged in, Settings, an incident page by
  query string, the map from the bundled file (with HTTP Range refused), saved data
  after the server is stopped, a report and an SOS queued then delivered exactly once,
  and logout clearing the saved data. 
- **The server side** with curl: token login, bearer requests, forged and wrong tokens,
  the cross-site guard, rate limits, no CORS headers.
- **Reading Capacitor's Android source** for: it sends no `Origin` header on native
  requests; its file server answers Range requests wrongly (206 with the whole file,
  which is why the map is read as one file instead); a path without a dot is answered with the
  home page (below).

**Not verified, and the likely trouble spots:**

1. **Native HTTP to the laptop.** That `CapacitorHttp` really reaches `http://192.168.x.x`
   from the phone, with cleartext allowed. If **Test** fails on the phone but the
   address opens in the phone's browser, this is it. Android 16 and later are adding
   a **local network** permission; if a phone shows a prompt about it, allow it.
2. **The Android WebView.** The UI needs a recent **Android System WebView / Chrome**
   (the CSS framework's published baseline is Chrome 111). An old phone that never
   updates WebView may show a broken layout. Update it from the Play Store.
3. **Layout under the status and navigation bars.** I set Capacitor's defaults and the
   app's background colour; how it looks with each phone's bars (edge-to-edge on
   Android 15+) is unchecked.
4. **Location permission dialog** and the Geolocation plugin: asked once after the
   first-run screen, and again when a position is needed. Whether a fix is obtained
   quickly outdoors, and with "approximate" location granted, is unchecked.
5. **Play Protect and the install prompts** (above): wording is from general
   knowledge of Android, not from my phone.
6. **A hard reload of an inner page.** Capacitor's built-in file server answers any
   address without a dot with the home page, so if the WebView ever reloads
   `/map/` itself (it does not in normal use; the app always starts at `/` and moves
   between screens without reloading) you would see Home. Close and reopen the app.
7. **Large maps.** The map is read into memory as one file; `build:mobile` refuses a
   map over 150 MB. Downloading a bigger map on first run (with progress) is **not
   built**. The Tricity map is 3.7 MB.
8. **Other limits:** no push notifications (the app checks while it is open); the four
   saved lists are public ones, not "my reports"; road directions have the limits in
   `docs/NAVIGATION.md` (estimates, no traffic, no turn restrictions); Android only (no iOS).

## Troubleshooting

- **Test says it could not reach the address.** Same WiFi? Is `npm run start:lan` still
  running (not plain `npm start`, which only listens on the laptop)? Open
  `http://<address>/api/health` in the phone's browser: you should see
  `{"status":"ok",...}`. A guest WiFi or hotspot that isolates devices ("client
  isolation") blocks it. The laptop's own hotspot does not.
- **"Plain http:// is only allowed for addresses on your own network".** The address
  is not private. Check you typed the laptop's address, not a public one.
- **Saved data banner stays.** The laptop cannot be reached; see the first answer.
- **Login keeps failing with "Too many requests".** The server limits logins (10 per
  15 minutes per address). Wait, or restart the server (the limits live in memory).
- **Build says "no JDK found".** Section 2a, or set `JAVA_HOME` and `ANDROID_HOME`.
- **Build fails with "invalid source release: 21".** Gradle is using an older JDK; set
  `JAVA_HOME` to the JDK 21 folder.
- **`npm run lint` or `npm run build` complain about `android/`.** They should not:
  `eslint.config.mjs` ignores it. Tell me if they do.

## Remove it

Uninstall RescueNet on the phone like any app. On the laptop, deleting `~/dev` frees
the roughly 2.2 GB of build tools (you can download them again later).

## How the build works (for whoever changes it)

`scripts/build-mobile.mjs` copies the app into a scratch folder, leaves out `app/api`
and the dynamic `/incidents/[id]` page (a static export cannot contain them), lays
`mobile/overlay/` on top, runs `next build` with `mobile/next.config.mjs`
(`output: "export"`), and moves the result to `app/out`. The overlay adds the
Android-only code (first-run screen, Settings, native HTTP and storage, saved data,
the bundled map source, the location plugin) and **replaces** a few small website
files with Android versions that export the same things. The website's own versions
of those files know nothing about the app, so no Android code can end up in the
website. The header of `scripts/build-mobile.mjs` lists them.
