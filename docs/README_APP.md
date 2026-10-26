# RescueNet: set it up on a fresh laptop

(The repo's own `README.md` is not editable under this project's rules, so the
real instructions live here.)

RescueNet is a Next.js app in the `app/` folder with a MongoDB database. Once
installed it needs **no internet**: the server, the database and the map file all
run on the laptop, and phones join over its WiFi or hotspot.

You need the internet **once**, to download Node, MongoDB, the code and the npm
packages. Do this part with a connection, well before the demo.

Commands are for macOS on an Apple-silicon Mac (what this was built on). Other
systems differ only in installing Node and MongoDB.

## 1. Install Node.js

Install Node **20.9 or newer** (it was developed on 24). Download the installer
from <https://nodejs.org>, or use `nvm`. Check:

```sh
node -v     # v20.9 or higher
npm -v
```

## 2. Install MongoDB from the tgz

Homebrew is not needed (and was broken on the build laptop).

1. Open <https://www.mongodb.com/try/download/community>. Choose **Platform:
   macOS ARM 64**, **Package: tgz**, and download. (The build laptop runs 9.0.4;
   any current Community Server release works.)
2. Unpack it and move it somewhere permanent:
   ```sh
   cd ~/Downloads
   tar -xzf mongodb-macos-aarch64-*.tgz
   mv mongodb-macos-aarch64-*/ ~/mongodb
   mkdir -p ~/data/db
   ```
3. Start it, in **its own terminal tab** (the "mongod tab"), and leave it running:
   ```sh
   ~/mongodb/bin/mongod --dbpath ~/data/db
   ```
   It must say it is "Waiting for connections" on port 27017. The database is
   created the first time something is saved.

If macOS refuses to open `mongod` ("cannot be verified"), run
`xattr -dr com.apple.quarantine ~/mongodb` once.

## 3. Get the code

```sh
git clone https://github.com/kartikbhardwajdev-27/RescueNet.git
cd RescueNet
git checkout rebuild          # the app lives on this branch
cd app
```

## 4. The settings file

```sh
cp .env.local.example .env.local
```

Open `.env.local` and set:

```
MONGODB_URI=mongodb://127.0.0.1:27017/rescuenet
JWT_SECRET=<a long random string>
```

Make the secret with `openssl rand -hex 32` (64 characters). It must be at
least **32 characters**: the server refuses logins with a shorter one, and with
the placeholder `change_me`. Never commit this file (it is git-ignored). The
database address must be on this laptop; the seed scripts refuse anything else.

## 5. Install the packages

```sh
npm ci
```

(`npm ci` installs exactly what `package-lock.json` says.) This is the last step
that needs the internet, apart from the map file below.

## 6. The offline map file

The street map is one file, `app/public/maps/tricity.pmtiles` (about 4 MB, covers
Chandigarh, Mohali and Panchkula). It is **not in git**. Either:

- **Copy it** from a laptop that already has it (USB stick, AirDrop) into
  `app/public/maps/`. This works with no internet. Or
- **Regenerate it** with the command in [`OFFLINE_MAP.md`](OFFLINE_MAP.md)
  (needs the free `pmtiles` command-line tool and the internet, once).

Without it the app still runs, but the map shows "Offline map tiles are missing"
over a blank background.

**Road directions need nothing from you:** the road file they use
(`app/public/routing/tricity-roads.rnrg`, 1.4 MB) **is in git**, so a fresh clone can
give directions with no internet. You only run `npm run routing:build` (one download of
about 214 MB) to refresh the roads: see [`NAVIGATION.md`](NAVIGATION.md).

## 7. Fill the database with the demo

```sh
npm run demo:seed
```

This adds six demo shelters, nine demo incidents (every severity, three
resolved), four demo events, and two demo accounts, all marked **Demo** or
`[DEMO]`, and prints the logins:

| Account | Email | Password |
| --- | --- | --- |
| Citizen | `demo.citizen@rescuenet.test` | `demo-rescuenet-2026` |
| Organization | `demo.org@rescuenet.test` | `demo-rescuenet-2026` |

It is safe to run again: it puts the demo scene back to its starting state with
fresh times, which is what you want **just before every rehearsal and the demo**.
`npm run demo:clear` removes the demo incidents, events and accounts (shelters
stay). It only ever touches records marked `seeded`, and it refuses to run against
any database that is not on this laptop.

Reports, events and accounts you make **by hand** while rehearsing are real records
and stay (the app has no delete button). On a laptop used only for the demo, name
the database `rescuenet_demo` (`MONGODB_URI=mongodb://127.0.0.1:27017/rescuenet_demo`);
then `npm run demo:wipe` empties it completely and `npm run demo:seed` refills it.
`demo:wipe` refuses to touch any database whose name does not end in `_demo`.

## 8. Build and start

Use the **production** build for anything offline (in `npm run dev` the saved-pages
feature is off on purpose):

```sh
npm run build          # once, and again after any code change
npm run start:lan      # server on every network interface, port 3000
```

Open <http://localhost:3000>. `start:lan` also prints the address phones use. To
print it again, or use another port:

```sh
npm run lan:url
PORT=3001 npm run start:lan
```

Check the server and the database are talking:

```sh
curl http://localhost:3000/api/health      # {"status":"ok","db":"connected"}
```

## 9. Phones

Put the phone on the **same WiFi**, or on the laptop's hotspot, and type the
address `npm run lan:url` shows (for example `http://192.168.1.6:3000`). It needs
no internet. Over plain http a phone cannot use location, saved pages or "Add to
Home Screen" (browsers only allow those on https or localhost), but reports,
logins, the map, shelters and events work. Details and what was and was not
tested: [`OFFLINE_APP.md`](OFFLINE_APP.md).

## Which terminal tab does what

| Tab | Runs | Leave it |
| --- | --- | --- |
| mongod tab | `~/mongodb/bin/mongod --dbpath ~/data/db` | running |
| app server tab | `npm run start:lan` (inside `app/`) | running; Ctrl+C stops the app |
| a third tab | `npm run demo:seed`, `curl`, `npm run lan:url` | free for one-off commands |

## Handy checks

```sh
npm run lint            # code style
npm run check:triage    # the keyword rules behind "Suggested priority" (220 checks)
npm run check:nearest   # the distance and direction maths (88 checks)
```

## If something is wrong

| You see | Try |
| --- | --- |
| `/api/health` says `"db":"disconnected"` | the mongod tab is not running, or `MONGODB_URI` is wrong |
| "There is no production build yet" | run `npm run build` first |
| Logins fail with a server error | `JWT_SECRET` is missing, still `change_me`, or shorter than 32 characters |
| "Port 3000 is in use" | something else (an old server, `npm run dev`) has it: stop it, or `PORT=3001 npm run start:lan` |
| Map says tiles are missing | `app/public/maps/tricity.pmtiles` is not there (step 6) |
| Phone cannot open the address | not on the same network, or a firewall; try the laptop's hotspot |
| An old demo scene | `npm run demo:seed` again |

## Known limits (said plainly)

- **Directions are estimates.** "Navigate to nearest shelter" works out a road route on
  the device from saved OpenStreetMap roads: no live traffic, no turn restrictions,
  one-ways may be incomplete, and closures are known only from incidents reported in
  RescueNet. Without road data, or outside the mapped area, it gives a straight line
  instead. Details: [`NAVIGATION.md`](NAVIGATION.md).
- **The map covers one area**: Chandigarh, Mohali and Panchkula. Elsewhere the
  basemap is blank (incidents and shelters still appear).
- **"Suggested priority" is a short list of keyword rules**, not a judgement. It
  can miss danger described in other words; people decide.
- **Rate limits are in memory.** They reset whenever the server restarts, and the
  per-address ones can be dodged with a fake `X-Forwarded-For` header.
- **Anyone can register as an organization**, with no verification.
- **The network is plain http.** Logins and reports cross the WiFi unencrypted:
  use a hotspot with a password, and no real passwords.
- **Offline sending needs the app open.** Queued reports and SOS are sent only
  while RescueNet is open in a browser; other changes (joining an event, editing a
  shelter, changing a status) need the server at that moment.
- **Phones over http** cannot use location or saved pages (see above).
- **Data is whatever people typed.** Nobody verifies reports, capacity or events.
- **Emergency numbers** on the Resources page and the safety guides are general
  and must be checked for the place of the demo.

More detail in [`SECURITY.md`](SECURITY.md).
