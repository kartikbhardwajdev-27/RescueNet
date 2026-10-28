# Offline map

The `/map` page draws its own map from files served by this app. At runtime it
makes **no requests to the internet**: no tile server, no CDN, no font host.

All paths below are relative to the `app/` folder.

| File | What it is | In git? |
| --- | --- | --- |
| `public/maps/tricity.pmtiles` | Vector tiles for Chandigarh, Mohali and Panchkula (zoom 0-14, about 4 MB) | Yes, as a one-time exception for the hosted deployment (regenerate it below if needed) |
| `public/map-assets/fonts/` | Glyph files for the four Noto Sans font stacks the basemap uses | Yes |
| `public/map-assets/sprites/v4/dark*` | Icon sprite for the Protomaps "dark" theme | Yes |

`tricity.pmtiles` is normally not committed, and `.gitignore` does not list it, so `git add -A`
would stage it: add files by path. **One-time exception (Step 29): the 3.7 MB file IS committed,
so the Vercel deployment has a map.** If you regenerate it, commit the new file the same way
(`git add -f app/public/maps/tricity.pmtiles`).

If `tricity.pmtiles` is missing the map still opens and the markers still work,
but the page shows "Offline map tiles are missing" over a blank background.

## Regenerate `tricity.pmtiles`

Needs the [`pmtiles` CLI](https://github.com/protomaps/go-pmtiles/releases)
(download the release binary for your platform and put it on your `PATH`).
Protomaps publishes a planet build every day; pick the newest date from
<https://maps.protomaps.com/builds/> and run this from `app/`:

```sh
mkdir -p public/maps
pmtiles extract https://build.protomaps.com/20261023.pmtiles public/maps/tricity.pmtiles \
  --bbox=76.60,30.55,76.95,30.85 --maxzoom=14
```

`--bbox` is `west,south,east,north`. The last build used was `20261023` and gave
a 3.9 MB file. If you widen the area and the file grows past about 60 MB, lower
`--maxzoom` to 13. If you change the bbox, update `COVERAGE_BBOX` in
`components/map/mapConfig.js` too, so the "outside the offline map" notice
matches.

Check the result, and that the app serves it with range requests (the first
line must say `206 Partial Content`; swap the port for the one you run on):

```sh
pmtiles show public/maps/tricity.pmtiles   # bounds 76.60,30.55 to 76.95,30.85, max zoom 14
curl -s -r 0-100 -I http://localhost:3000/maps/tricity.pmtiles | head -1
```

## Regenerate the fonts and sprite

Only needed if you upgrade `@protomaps/basemaps` (its sprite and font names must
match). Last downloaded from `protomaps/basemaps-assets` at commit `028c18f`:

```sh
git clone --depth 1 https://github.com/protomaps/basemaps-assets /tmp/basemaps-assets
mkdir -p public/map-assets/fonts public/map-assets/sprites/v4
for f in "Noto Sans Regular" "Noto Sans Medium" "Noto Sans Italic" "Noto Sans Devanagari Regular v1"; do
  cp -RL "/tmp/basemaps-assets/fonts/$f" public/map-assets/fonts/
done
cp /tmp/basemaps-assets/fonts/OFL.txt public/map-assets/fonts/
cp /tmp/basemaps-assets/sprites/v4/dark* public/map-assets/sprites/v4/
```

`-L` matters: the Devanagari stack is made of symlinks to the Regular stack, and
symlinks inside `public/` break on some checkouts and deploys.

## How it fits together

- `components/map/mapConfig.js` builds the MapLibre style: the Protomaps
  `dark` theme over `pmtiles://<this site's origin>/maps/tricity.pmtiles`, with
  glyphs and sprite from `/map-assets` (absolute URLs, because the style is also
  read inside a web worker, where relative ones would not resolve).
- `components/map/mapRuntime.js` registers the `pmtiles://` protocol and gives
  MapLibre its web worker from this app's own `/_next/static` output.
- The browser reads tiles with HTTP range requests, so whatever serves
  `public/` (Next.js does) must answer `Range` with `206`.

## Credits

Map data © OpenStreetMap contributors (ODbL), shown in the map's attribution.
Basemap tiles and style by Protomaps. Fonts: Noto Sans, SIL Open Font License
(`public/map-assets/fonts/OFL.txt`).
