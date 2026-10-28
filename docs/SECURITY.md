# Security notes

What was checked in the Step 17 hardening pass, what was fixed, and what is
**not** fixed. Paths are relative to `app/` unless they start with `docs/`.

## Read this first: the old Atlas password

A teammate committed a `.env` file to the **`master`** branch of this **public**
GitHub repository (commit `0b58cf0`, "Setup RescueNet backend"). It contains
MongoDB Atlas connection strings **with passwords** for two Atlas accounts, plus a
commented-out JWT secret. Anyone can read it, and git history keeps it even if the
file is later deleted. This branch (`rebuild`) and `main` do not contain it, and I
did not touch `master`.

**Do this by hand, in Atlas:** change the password of every database user named in
that file (and delete users nobody needs), or delete the clusters if they are not
used. Treat the old JWT secret as burned too. Removing the file from `master`
would not make the old passwords safe again.

## Route by route

"Role" means the logged-in account's role, read from the database on every request
(never from the login token). All bodies are read through `readJsonBody`, which
refuses anything over 32 KB.

| Route | Who may call it | Checks |
| --- | --- | --- |
| `POST /api/auth/register` | anyone | rate limit 10/hour per address; every field type-checked; password 8 to 72 bytes; role limited to citizen or organization; 409 for a taken email |
| `POST /api/auth/login` | anyone | rate limit 10 per 15 min per address **and** 15 per 15 min per account; email and password must be strings; a wrong email takes as long as a wrong password |
| `POST /api/auth/logout` | anyone | clears the cookie |
| `GET /api/auth/me` | logged in | 401 otherwise; never cached |
| `GET /api/incidents`, `/api/incidents/[id]` | anyone | filters are exact enum values; ids are 24 hex characters; limit capped at 200; no reporter id in the answer |
| `POST /api/incidents`, `POST /api/sos` | anyone | rate limit 10 per 10 min per address; types, severity, location and text length validated; status, reporter, SOS flag and priority score cannot be set by the sender |
| `GET /api/incidents?mine=true` | logged in | 401 otherwise; matched on the id in the session, never on anything in the URL |
| `PATCH /api/incidents/[id]` | organization | only `status`, only `in_progress` or `resolved`; 60 updates per 10 min |
| `GET /api/shelters` | anyone | no creator id in the answer |
| `POST /api/shelters` | organization | validated; 20 per hour |
| `PATCH /api/shelters/[id]` | the organization that added it | demo shelters cannot be edited; only occupied, capacity, status |
| `GET /api/events` | anyone | attendee list never sent, only a count; organizer shown as the organization's name only |
| `POST /api/events` | organization | validated; organizer comes from the session; 20 per hour |
| `PATCH`, `DELETE /api/events/[id]` | the organization that posted it | cancel keeps the record; capacity cannot drop below people already joined |
| `POST`, `DELETE /api/events/[id]/rsvp` | logged in | one atomic update checks cancelled, ended, full and already-joined together, so five people racing for one space gives exactly one winner |
| `GET /api/events/mine` | logged in | 401 otherwise |
| `GET /api/stats`, `GET /api/health` | anyone | counts only; health says only "connected" or not |

Strings that arrive as objects (`{"$ne": null}`) are rejected everywhere a string
is expected (checked on login, register, incidents, SOS, shelters, events and
status updates), and query strings are parsed into fixed enums, numbers and ids
before they reach a query.

## Fixed in this pass

1. **Login cookie** is now `Secure` only when the request was https. Before, in
   production it was always `Secure`, so over `http://<laptop-ip>` the browser
   threw it away and nobody could log in on a phone. See `docs/OFFLINE_APP.md`.
2. **Body size.** No limit existed. Now 32 KB: refused by `Content-Length` in
   `proxy.js`, and counted again as the bytes arrive in `lib/http.js` (for uploads
   with no or a false length). Answer: 413.
3. **Cross-site writes.** `proxy.js` refuses any POST, PATCH or DELETE to `/api`
   that carries a foreign `Origin` or `Sec-Fetch-Site: cross-site`. This sits on top
   of `SameSite=Lax` on the cookie. Tested with a real page on another origin.
4. **Security headers** (`next.config.mjs`): a Content-Security-Policy that allows
   only this origin (plus `blob:` workers and `data:`/`blob:` images for the map),
   `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`,
   `Permissions-Policy` (location only), cross-origin isolation headers. The
   `X-Powered-By` header is gone.
5. **Private ids no longer leave the server.** Incidents carried `reportedBy`,
   shelters `createdBy`, and events the organizer account holder's personal name.
   Those are removed; screens get `isMine` instead.
6. **Login guessing** is also counted per account, because the per-address limit
   can be dodged (below).
7. **Updates are rate limited** (status changes, shelter and event edits, cancels,
   leaving an event), 60 per 10 minutes.
8. **JWT secret** must be at least 32 characters (and not `change_me`), or the
   server will not issue or accept login cookies.

## Checked and fine

- `npm audit`: **0 vulnerabilities** (production and development). I did not run
  `npm audit fix`.
- Passwords: bcrypt (cost 10), 72-byte limit enforced so a long password cannot be
  silently truncated.
- Login token: HS256 pinned on verification, 7-day expiry, `HttpOnly`,
  `SameSite=Lax`, path `/`. The role is read from the database, not trusted from
  the token.
- XSS: React escapes everything. The one `innerHTML` (the shelter icon) is a fixed
  string with no data in it. The CSP blocks `eval` and outside scripts (tested).
- No open redirects (no redirect target comes from a URL).
- The production build has no Next.js development badge or overlay (searched the
  built pages). The badge only exists under `npm run dev`.
- Secrets: nothing secret is tracked on `rebuild` or `main` (searched the files and
  the history of those branches); `.env.local` is git-ignored. The only exception is
  `master`, above.
- Errors: unexpected failures return a bare 500 with no stack, path, host or driver
  text (tested with the database unreachable).

## The Android app (Steps 19 to 22)

The APK is the same UI as a static export. It has no server of its own: it talks
to the RescueNet server on the laptop. These are the security decisions that came
with that. Nothing here changes how the website works.

**Login uses a bearer token, not a cookie.** The app's pages are files inside the
APK, not served from the laptop's origin, so the server's cookie cannot be used.
`POST /api/auth/login` and `POST /api/auth/register` return the same JWT the
cookie would have held **only when the body says `"returnToken": true`** (and set
no cookie in that case); every other client gets exactly what it got before. The
server accepts `Authorization: Bearer <jwt>` in addition to the cookie
(`lib/auth.js`, `lib/bearer.js`): the signature, expiry and algorithm are checked
the same way, and the role is still read from the database on every request. A
bearer header that does not verify makes the request anonymous (the cookie does
not rescue it); an `Authorization` header of another kind (Basic) is ignored.

**The cross-site guard and CORS are unchanged.** A browser never attaches an
`Authorization` header by itself, so the bearer path gives another website nothing
to ride on, and `proxy.js` still refuses a write that carries a foreign `Origin`
or `Sec-Fetch-Site: cross-site`, with or without a bearer header (tested). The
app's requests are made natively by Android (CapacitorHttp), so CORS does not
apply to them and the server sends **no** `Access-Control-*` header to anyone.
Native requests carry no `Origin` header, which is why the guard lets them through.
Rate limits and input validation are the same code paths as before.

**The token is stored unprotected on the phone.** It lives in the Capacitor
Preferences plugin (Android SharedPreferences, private to the app), like a
browser keeps a cookie in its profile. Other apps cannot read it; someone with
root access or an unlocked, USB-debugging phone could. Backups are switched off
(`android:allowBackup="false"`) so it is not copied into Android backups.
Logging out forgets the token on the phone, but a JWT cannot be cancelled on the
server: a copy would stay valid until it expires (7 days), exactly as a copied
cookie does on the website. Changing the "Laptop address" also forgets the token,
so a login is never sent to a server it was not issued by.

**Cleartext (plain http) is allowed, deliberately.** Android 9 and later refuse
plain-http traffic unless the app opts in, and a laptop on a WiFi has no
certificate, so the app sets `android:usesCleartextTraffic="true"`. The trade-off:
anyone on the same WiFi can read or alter what travels between the phone and the
laptop, including the login token and the text of reports. What limits it:

- the app contacts **one** address, the one typed on the first-run screen or in
  Settings, and no other host (its own files, map and fonts are inside the APK);
- plain `http://` is accepted only for addresses on a private network (10.x,
  172.16-31.x, 192.168.x, link-local, loopback, `localhost`, `.local`/`.lan`
  names); anything else must be `https://` (`lib/serverAddress.js`, and
  re-checked before every request in `mobile/overlay/lib/native/http.js`);
- the address cannot contain a username or password.

Use your own hotspot or a network you trust. The proper fix is https on the laptop
with a certificate the phone trusts; that is not set up.

**The page inside the app has a strict Content-Security-Policy** (a `<meta>` tag,
since there are no headers): only the app's own files, and no network access from
the page at all. The app's API calls are made natively, outside the page.

**Not verified on a real phone or emulator in this build**, so these are design
statements, not test results: how Android treats the local-network request, the
Play Protect warning, and the permission dialogs. See `docs/APK_SETUP.md`.

## NOT fixed, and why

- **Anyone can register as an organization.** There is no verification, so anyone
  can mark incidents resolved, add shelters and post events. Fixing it needs a
  real approval step (an administrator, or a code handed out by the organizer).
  That is a design decision, not a patch.
- **The network is plain http.** Passwords, login cookies and reports cross the
  WiFi unencrypted, so anyone on the same network can read them. That is how the
  offline setup works (browsers allow https only with a certificate a phone
  trusts; see `docs/OFFLINE_APP.md`). Use a hotspot with a password, not a public
  WiFi, and do not reuse a real password.
- **Rate limits live in memory.** They reset when the server restarts, and the
  per-address ones can be dodged by sending a fake `X-Forwarded-For` header (the
  server cannot see the real address without a trusted proxy in front). Only logins
  have a second, per-account limit. Anonymous reports and SOS have **no global cap
  on purpose**: during a real emergency an SOS must never be refused.
- **Login tokens cannot be revoked.** Logging out deletes the cookie in that
  browser; a copied token still works until it expires (7 days). There is no
  password change or reset.
- **Locking an account by guessing.** The per-account login limit also lets a
  stranger lock someone out for 15 minutes by typing their email. The trade-off is
  chosen; the limit is 15 tries.
- **The CSP allows inline scripts and styles** (`'unsafe-inline'`). Next.js writes
  small inline scripts into every page, and a nonce would force every page to be
  rendered per request, which the pages saved for offline cannot be.
- **No HSTS header**, because the app is served over http (browsers would remember
  it for `localhost`).
- **Registration says whether an email is taken** (409). The rate limit slows
  anyone using it to look people up.
- **Reports are public.** Anyone can read every incident's text, address and
  location, and shelters' contact numbers. That is the point of the app, but a
  reporter can type personal details, and the app does not warn them.
- **Capacity, status and reports are unverified** (see the About page).

## Hosted deployment (Step 29)

See `docs/DEPLOY.md` for the steps. What changes for security:

- **Rate limits** are kept in MongoDB when the database is not on the same machine (a TTL-indexed
  `ratelimits` collection, one counter per caller per window, ids are hashes, no address or e-mail
  is stored), so they hold across Vercel's instances. Same limits as the in-memory ones on the
  laptop. If the database is down the limiter lets the request through.
- **Client address.** On Vercel the per-address limits use `x-vercel-forwarded-for` (set by the
  platform). Elsewhere they use the last `x-forwarded-for` entry, which a client can forge when no
  proxy of yours is in front: the per-address limits can then be dodged (the per-account login
  limit cannot). Do not put another proxy in front of the app without checking this.
- **Cookie** is `Secure` over https (Vercel) and plain over http (laptop). `COOKIE_SECURE=true|false`
  forces it.
- **Startup check** prints the names (never values) of missing `MONGODB_URI` / `JWT_SECRET`, and
  says when `JWT_SECRET` is shorter than 32 characters (logins refuse to work with it).
- **The hosted demo seed** needs `--hosted`, a typed database name, and your own `DEMO_PASSWORD`
  (not the laptop default). The demo accounts share that password: remove them after a demo.
- **Atlas**: a new cluster and a new database user limited to `readWrite` on one database;
  network access is open to all addresses because Vercel has no fixed address, so the password
  is the only gate.
