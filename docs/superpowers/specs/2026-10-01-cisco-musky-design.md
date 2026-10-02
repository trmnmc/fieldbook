# Cisco Musky: Design Spec

Date: 2026-10-01
Status: draft for review
Path: architectural (new project)
Repo: `cisco-musky`, public, published with GitHub Pages at `https://trmnmc.github.io/cisco-musky/`

## 1. Purpose and readers

**Who uses it.** Two people, one iPhone.

- Truman. New to musky fishing. Needs the basics and needs to be useful on the boat.
- Dad. A seasoned musky angler who has caught big fish elsewhere. New to the Cisco Chain.

**What it must be.** The expert on this chain. Not a generic musky app. It tells a veteran what he does not know yet: which of the 15 lakes hold musky, what the fish eat here, where the structure is, how fall plays out on this water, and which rulebook applies on which lake. It tells the beginner what each of those facts means and what his job is at that moment.

**Where it runs.** Installed on the iPhone home screen. Fully offline on the water. No accounts, no server, no sync. The log never leaves the phone unless exported.

**When.** First usable version on 2026-10-02. Content grows after that.

**Success criteria for version one.**

1. Installs from Safari to the home screen and opens with no signal.
2. For any lake and date, produces ranked time windows, spots, and lures, each with a pro reason and a beginner "your job" line.
3. Logs a follow in three taps or fewer, with the condition snapshot filled automatically.
4. Exports the log as JSON and as a CSV in Muskies Inc Lunge Log column order.
5. Every fact about the chain is verified against a named source, or labeled unverified.
6. A veteran reads the fall chapters and learns something about this chain.

**Non-goals.** No accounts, sync, or social features. No fish identification. No offline bathymetry tile maps in version one. No machine learning. No trip sharing between phones.

## 2. Decisions made during brainstorming

| Decision | Choice | Why |
|---|---|---|
| Adopt, extend, or build | Build | Nothing musky-specific exists. Currents (MIT, Swift) has the feature shape but is native iOS 26 and carries none of the content. FishCast (MIT, static PWA) validates the mechanism but covers about a third of the need. See `docs/superpowers/specs/2026-10-01-scout-notes.md` for the candidate table. |
| Platform | Static web app, no framework, no build step | Zero toolchain. Installs on iPhone from a URL. The service worker makes it offline. |
| Hosting | GitHub Pages, public repo | iPhone installs offline web apps only over HTTPS. Pages is free and live in minutes. Guide content is public. The log stays on the phone. Approved by Truman. |
| Waters | The Cisco Chain, all 15 lakes, Fishhawk included | Truman lives on Fishhawk. The chain is connected water with four public landings. |
| Content order | Fall first, other seasons outlined | Fishing starts in October. |
| Spots | Seeded from DNR maps and reports, labeled unverified | Gives a starting point tomorrow. Verified by fishing them. |
| Water temperature | Entered from the fish finder | Most reliable input the planner has. |
| Live weather | Open-Meteo, National Weather Service as fallback | Both free, no key. Verified live for the chain's coordinates on 2026-10-01. |
| Astronomy | suncalc, vendored | BSD-2, 3,484 stars, pushed 2026-10-01. Sun, moon phase, moonrise, moonset, moon position. All offline. |
| Log standard | Veteran level, Lunge Log compatible, photos in version one | Dad's standard. Added by Truman: depth the fish hit at, photos now, trolling detail, Lunge Log field match. |

## 3. Architecture

### 3.1 Files

```
cisco-musky/
  index.html              app shell, one page, views swapped by JS
  manifest.webmanifest    name, icons, standalone display
  sw.js                   service worker: precache + runtime cache
  css/app.css             sunlight-readable, large tap targets, dark mode
  js/app.js               router, views, navigation
  js/content.js           loads and indexes the JSON content
  js/astro.js             suncalc wrapper: sun, moon, windows
  js/weather.js           Open-Meteo fetch, NWS fallback, pressure trend
  js/engine.js            pattern matching and ranking
  js/planner.js           plan view: inputs, calls engine, renders reasons
  js/log.js               trip and event capture
  js/store.js             IndexedDB wrapper
  js/export.js            JSON and CSV export, JSON import
  js/vendor/suncalc.js    vendored, BSD-2, with LICENSE
  content/lessons.json
  content/lakes.json
  content/spots.json
  content/lures.json
  content/patterns.json
  content/rules.json
  content/sources.json
  maps/<lake-id>.jpg      DNR depth maps, downscaled
  icons/
  test/engine.test.js     Node test runner, no dependencies
  test/content.test.js    schema and cross-reference checks
  test/astro.test.js      known moon events for the chain
```

### 3.2 Offline strategy

- The service worker precaches every file above under a versioned cache name. First load on wifi pulls everything, including the lake map images. After that the app opens with no signal.
- Open-Meteo and NWS requests are network-first with a cache fallback. The app stores the last good forecast with its fetch time. The forecast panel always shows the forecast age.
- When a new version is published, the service worker installs it in the background and the app shows a banner: new version, tap to reload.
- The app asks for persistent storage on first run so iOS does not evict the log.

### 3.3 Storage

IndexedDB, one database, these stores:

| Store | Holds |
|---|---|
| trips | one record per trip: frozen plan, lake, start and end, rating, notes |
| events | follows, strikes, catches, here-marks, notes, with snapshot |
| spots | user-added spots and edits to seeded spots, keyed by spot id |
| photos | JPEG blobs keyed by event id, long edge 1600 px or less |
| forecasts | last good forecast per source with fetch time |
| settings | units, last water temperature per lake, reminders |

localStorage holds only UI state such as the last open tab.

### 3.4 iPhone specifics

- Install: Safari share sheet, Add to Home Screen. The app shows a one-time hint.
- Photos: a file input with camera capture. The app downscales in a canvas before storing.
- Location: the browser geolocation API. Denied permission falls back to picking the spot from a list.
- Export: the Web Share API with files, which opens the iOS share sheet. Fallback is a download link.
- Storage: the app calls the persistent storage request once and shows the result in Settings.

## 4. Content model

All content is JSON. Every record that states a fact about the chain carries a `sources` array of ids into `sources.json`. Every lesson section and pattern carries two voices:

- `pro`: the reasoning a veteran expects.
- `yourJob`: what the beginner does with it on the boat.

### 4.1 lessons.json

```
{ id, order, title, track: "basics" | "pro" | "both",
  sections: [ { heading, pro, yourJob, sources } ] }
```

Chapters, in order:

1. The fish. Ambush predator, lateral line, metabolism against water temperature, why follows happen, why the figure-8 works.
2. This chain. Fifteen lakes, one connected system raised four to five feet by the 1931 dam. Which lakes hold musky and why. Forage: cisco, perch, suckers, bluegill. Clear water. Shallow bowls against two deep basins.
3. Seasons by water temperature. Spring, early summer, summer, fall turnover, late fall, ice. Fall at full depth: 65 to 55°F, 55 to 50°F, under 50°F, the cisco spawn in late November.
4. The daily clock. Dawn and dusk. Moon phase, moonrise, moonset, overhead, underfoot. What the data actually shows: a 5% lift around full and new moon across 341,959 catches, stronger for fish over 40 inches, and Dettloff's 34.7% of 40-inch-plus fish in the full moon period against 25% expected.
5. Weather. Pressure and its trend. Pre-front feeding. Post-front slowdown and how long it lasts. Wind and which structure it loads. Sky and light.
6. Structure. Weed flats, inside and outside weed edges, cabbage against coontail against milfoil, points, inside turns, saddles, humps, breaks, necks and channels between lakes, inlets, wood, rock. How to read a DNR contour map.
7. Lures. Bucktails, topwater, gliders, jerkbaits, crankbaits, rubber, spinnerbaits, live suckers on quick-strike rigs. Size, speed, depth, light, temperature band for each. When not to.
8. Presentation. Casting rhythm, retrieve speed as the main variable, the figure-8 every cast, boat control, trolling speed and line out, sucker rigging and when to set.
9. Gear and fish care. Rod, reel, line, leaders. Net, bump board, hook cutters, long pliers, jaw spreaders. Keep the fish in the water. Measure fast. Release.
10. Rules on this chain. Three different size limits. Which license where. Registration. Pike rules. Catch and release all year.
11. First mate. A basics-only chapter: how to help a veteran. Net work, release tools ready, calling follows, watching the sonar, matching his cadence, boat position on a drift, what to say and not say when a fish follows.
12. What to do next. The adjustment chapter, track `both`. Three sections, each with pro reasoning, a plain "your job" line, and sources. Any claim without a named source is labeled "reasoning, not sourced" in the text.
    - Nothing is happening. A checklist in order: are you inside a light or moon window or between them; are the weeds green and standing or brown and down; are you on the edge or on top of the structure; is the speed right, because the wrong speed costs more follows than the wrong lure; does the sonar show bait; has the wind moved off this structure. Change one thing at a time and give it twenty minutes. Your job: keep the clock, call the weeds, say what the sonar shows.
    - A follow without a strike. The fish told you three things: it is there, the lure is close, the trigger is missing. Respond in order: speed first (faster in warm water, slower under 55°F), then the figure-8 (wider, deeper, faster on the turns), then size up or down, then a different family with the same action, then return in the next window. Mark the spot and the time. Your job: log the follow before the next cast, net ready, watch the fish on the 8 and say where it is.
    - When to adjust. Depth: follows come up from deep under the lure, bait shows deeper on sonar, or water has cooled below 55°F. Retrieve: lazy follows mean change speed or add pauses; hot follows that turn away mean a bigger 8 and faster turns. Boat position: the wind has changed, you are casting with the wind instead of across the structure, or you are too close over water with 12 ft of visibility. Location: two windows with no sign of a fish, dead weeds, no bait, or the wind now loads a different lake. Your job: time the twenty minutes, say when a window opens or closes, have the next lure ready.

### 4.2 lakes.json

```
{ id, name, states: ["MI"] | ["MI","WI"], boundaryWater: bool,
  acres, maxDepthFt, meanDepthFt, secchiFt, thermoclineFt: [lo, hi],
  character: "shallow_weed_bowl" | "deep_basin" | "mid_depth_mixed",
  connections: [ { to: lakeId, kind: "channel" | "narrows" | "creek" | "dam" } ],
  launches: [ { name, lat, lon, surface, notes } ],
  structureSummary, forage: [], muskyStatus: { wiClass, wiCategory, miStocking, notes },
  rulesId, mapImage, sources }
```

Fifteen records. Facts verified so far are in section 7.

### 4.3 spots.json

```
{ id, lakeId, name, lat, lon,
  type: "weed_flat" | "weed_edge" | "point" | "inside_turn" | "saddle" | "hump" |
        "break" | "neck" | "inlet" | "outlet" | "rock" | "wood" | "island" | "shoal",
  depthRangeFt: [lo, hi], weedType, bottom,
  bestWind: ["W","NW"], tempBandsF: [[lo,hi]], months: [],
  lureFamilies: [], notes, source, verified: false, addedBy: "seed" | "truman" | "dad" }
```

Seeded for version one on Thousand Island, Cisco, Big, Mamie, and Fishhawk. Each seeded spot cites the map or report it came from. The log flips `verified` when a trip fishes it.

### 4.4 lures.json

```
{ id, family, example, sizeIn, tempBandsF: [[lo,hi]], light: [], windMph: [lo,hi],
  retrieve, speed: "slow" | "medium" | "fast" | "burn", runDepthFt: [lo,hi],
  trollOk: bool, whenNot, yourJob }
```

### 4.5 patterns.json

```
{ id, name,
  when: { tempF: [lo,hi], months: [], timeOfDay: [], sky: [], windMph: [lo,hi],
          pressureTrend: ["falling","steady","rising"], frontHoursAgo: [lo,hi],
          clarity: [], lakeCharacter: [] },
  favor: { windows: { dawn: w, dusk: w, moonrise: w, moonset: w, overhead: w, underfoot: w, midday: w, night: w },
           spotTypes: { weed_flat: w, ... }, lureFamilies: { glider: w, ... }, speed },
  pro, yourJob, sources }
```

Every condition in `when` is optional. A missing condition matches anything. Each `w` is an integer weight from 1 to 5. The file is readable as prose by anyone who opens it.

### 4.6 rules.json

One record per rulebook: Michigan inland, Michigan-Wisconsin boundary waters, with a lake-to-rulebook map. Fields: season, catch-and-release season, minimum size, daily and yearly limit, registration, lines allowed, license validity, pike rule, source, verified date.

### 4.7 sources.json

`{ id, title, publisher, url, date, fetched, note }`. Every fact in the app links back here.

## 5. Planner and engine

### 5.1 Inputs

| Input | Source | Default |
|---|---|---|
| lake | user | last used |
| date | user | today |
| water temperature | user, from the fish finder | last entered for that lake |
| sky | forecast, user can override | forecast |
| wind speed and direction | forecast, user can override | forecast |
| pressure and 3-hour trend | forecast history | forecast |
| hours since last front | computed from pressure and wind history, user can override | computed |
| water clarity | user | last entered for that lake |
| presentation | user: casting, trolling, suckers, any | any |

### 5.2 Computed on the phone

Sunrise, sunset, civil twilight. Moon phase and illumination. Moonrise and moonset. Moon overhead and underfoot by scanning moon altitude per minute for the day's maximum and minimum. Major windows: one hour either side of overhead and underfoot. Minor windows: thirty minutes either side of moonrise and moonset. All from suncalc with the chain's coordinates and the America/Chicago timezone.

### 5.3 Algorithm

1. Build the condition object from inputs and computed values.
2. For each pattern, test every present `when` field. Keep patterns where all present fields match.
3. Sum `favor` weights across matched patterns for each window, spot type, and lure family.
4. Windows: list the day's windows, score each, sort descending.
5. Spots: for each spot on the lake, score = spot-type weight + wind match bonus + temperature band match bonus + month match bonus + own-log bonus (phase 2). Sort descending. Show the top five.
6. Lures: for each lure, score = family weight + temperature band match + light match + wind match + presentation filter. Sort descending. Show the top three.
7. Attach the `pro` and `yourJob` text of every pattern that contributed to each item.
8. Produce one "watch for" line from the highest-weight pattern.

Deterministic. Same inputs, same output. Tested with fixtures.

### 5.4 Output

Three ranked lists and one line. Each item shows a title, a one-line reason, a "your job" line, and a link to the lesson. Example:

> **5:40 to 7:10 pm.** Dusk, moonrise at 6:22, pressure falling 3 hPa since 2 pm.
> Your job: net in the boat, pliers and cutters on the deck, before 5:30.

## 6. Trip log

### 6.1 Lifecycle

Plan, then Start Trip. The trip freezes the plan. On the water, events. Then End Trip, rate it, note what worked. The trip view later shows plan against outcome.

### 6.2 Events

| Event | Taps | Fields |
|---|---|---|
| Here | 1 | GPS, spot picked or nearest, starts the spot timer |
| Follow | 2 | size estimate, heat (lazy, hot, hit the 8), where seen (mid-retrieve, boat side), lure, color, speed, position on structure, depth under boat |
| Strike | 2 | hooked or missed, lure, color, speed, position, depth under boat, on the 8 |
| Catch | 3 | length, girth, lure, color, size, retrieve, where it hit, depth fish hit at, depth under boat, hook location, release time, photo, marks photo, marks note |
| Note | 1 | free text, voice-to-text through the iOS keyboard. Optional Adjustment toggle reveals: what changed (depth, retrieve, lure, boat position, location), why in Dad's words, and an outcome field filled later |
| Bait seen | 1 | cisco, perch, sucker, bait ball on sonar |

Tap counts mean: open the event, then save with the prefilled defaults (last lure, last spot, current conditions). Editing any field is optional and costs extra taps.

Every event stores a snapshot: time, lat, lon, moon phase, minutes to the nearest moon event and which one, pressure and 3-hour trend, wind speed and direction, sky, water temperature, clarity, forecast age.

Presentation fields on the trip or per event: casting, trolling (speed, running depth, line out, rod position), suckers (rig, sucker size, drifted or anchored).

Spot fields per event: structure type, weed type, bottom, depth under boat, position (on top, edge, off the break, inside turn).

**Adjustment notes.** No new screen. The Note form has an optional Adjustment toggle. On, it shows three fields: what changed, why, and outcome. Why is Dad's reasoning in his words. Outcome is optional and can be filled from the trip view afterward. The trip summary lists adjustments in sequence with the events that followed them, so the log answers: what did we change, why, and what happened next. Lesson 12 links here.

### 6.3 Effort

The Here event starts a timer for that spot. The next Here or End Trip stops it. Rates are per hour. The trip summary shows follows per hour by spot and by lure.

### 6.4 Photos

Captured through the camera, downscaled to a 1600 px long edge JPEG in a canvas, stored as a blob keyed by event. Settings shows photo storage used. Export includes photos as files when the share sheet allows it.

### 6.5 Lunge Log compatibility

Muskies Inc records up to 28 fields per fish. The known fields are date, time, water body, state, length, girth, lure type, lure color, sky, water clarity, water depth, depth the fish hit at, weed type, bottom type, barometric pressure, moon phase, and release status. The catch event captures all of these. The CSV export emits one row per catch in that column order so a row can be typed into the Lunge Log form. Length is measured with the fish in the boat on a board, tip of lower jaw to tip of tail, per Muskies Inc policy. The app says so in the catch form.

### 6.6 Export and import

JSON: the whole database except photos, plus photos as separate files when sharing. CSV: catches in Lunge Log order, and a second CSV of all events. Import: a JSON file restores or merges by id. The app reminds once a month to export.

### 6.7 Dad's input

Spots and notes can be added with `addedBy: "dad"`. They show with his name. A spot he marks is verified on creation.

## 7. Content plan and sources

### 7.1 Verified facts, in the app from day one

| Fact | Source |
|---|---|
| 15 lakes: Cisco, Thousand Island, Big, West Bay, East Bay, Mamie, Indian, Poor, Fishhawk, Lindsley, Clearwater, Big African, Little African, Record, Morley. About 4,000 acres, 270 miles of shoreline. | LakeLubbers |
| The 1931 dam raised the chain four to five feet and created the navigable channels. Clearwater has no navigable channel. Water level varies about six inches a year. | LakeLubbers |
| Thousand Island: 1,078 acres per the DNR report (other sources say 1,009 to 1,020), 81 ft max (other sources say 40 ft; the DNR survey wins), Secchi 12 ft, thermocline 17 to 26 ft in summer, no oxygen below 50 ft in summer, steep shoals of sand, gravel, and peat, abundant submergent and floating weeds, logs and sunken islands. Inlets from Big African and Lindsley. Outlet through Cisco via the dam to the Cisco Branch of the Ontonagon. State access on the east shore. | MI DNR status report 1993, Deephouse |
| Thousand Island: cisco present historically. Two large musky seen in 1988, one about 25 lb. No natural musky reproduction documented. Walleye the primary predator. | MI DNR status report 1993 |
| Michigan has stocked northern-strain muskellunge in Thousand Island Lake. Tiger musky and lake trout stocked in the chain historically. | MI DNR SR47; MI DNR stocking bulletin |
| Michigan state record northern muskellunge, 49.75 lb, from Thousand Island Lake, 1980. | MI 2026 digest Master Angler table; LakeLubbers |
| Fishhawk 77 acres, 8 ft. Cisco 506 to 567 acres by source, 20 ft. Lindsley 156 acres, 46 ft. Record 68 acres, 16 ft. Clearwater 172 acres, 10 ft. Mamie 337 to 400 acres by source, 10 ft. Indian 129 acres. Big 733 acres (WI DNR: 771). West Bay 362 acres (WI DNR: 368). East Bay 277. Poor 106. Big African 86. Morley 59. Little African 31. Acreage conflicts are shown as ranges in the app with both sources. | lake-link, LakeLubbers, Wikipedia, WI DNR 2018 |
| Wisconsin DNR classifies Big, Mamie, and West Bay as Class A1 trophy waters, reproductive Category 1: self-sustaining, no stocking. | WI DNR Muskellunge Waters 2018 |
| Four public landings: Thousand Island (concrete DNR ramp, east side), Cisco, Big, Mamie (gravel, Spring Creek inlet). | Angler's Isle, fishweb, uptravel |
| Michigan inland musky: 42 inch minimum, 1 per angler per license year, register within 24 hours, catch-and-release all year, possession season first Saturday in June through March 15. | MI 2026 digest |
| Boundary waters (Big, Mamie, West Bay): 50 inch minimum, first Saturday in June through December 31, catch-and-release all year, registration, either state's license valid, follow the rules of the state you are in, up to 3 lines. | MI 2026 digest boundary section |
| The 46-inch figure found in one search is the Master Angler entry minimum, not a rule. | MI 2026 digest |
| Sept 24, 2026: water 63 to 71°F, musky bite picking up, fish on shallow weed flats, topwater early and late, suckers in the bait shop and being tried. | All Northwoods report, Bill |
| Lunar effect on musky catch: about 5% around full and new moon across 341,959 records 1970 to 2013, stronger for fish over 102 cm. Night catches peak at full moon. | Vinson and Angradi 2014, PLOS ONE |
| Dettloff, Chippewa Flowage: full moon period 34.7% of 40-inch-plus fish against 25% expected. | MuskieFIRST citing Dettloff |
| Open-Meteo returns hourly pressure, wind, gusts, cloud, temperature, and 96 hours of history for 46.26, -89.47. NWS Marquette grid 86,54 is the fallback. | Verified live 2026-10-01 |

### 7.2 To research for version one

1. Michigan DNR depth maps for each Michigan lake. The county page blocks fetching; try direct PDF links and the DNR map index. Downscale to JPEG.
2. Wisconsin DNR depth maps and lake pages for Big (doclink 2334700a.pdf, 1973), Mamie, and West Bay. Fish survey summaries if published.
3. Michigan DNR fish stocking database: muskellunge entries for Thousand Island and any other chain lake, with year, strain, and count.
4. All Northwoods Cisco Chain reports for October and November of past years, for fall patterns on this water.
5. Which Michigan chain lakes carry the special northern pike rule that lists them in the 2026 digest.
6. Cisco spawn timing and depth for this latitude, from Wisconsin DNR or Michigan DNR literature.
7. Fall musky patterns for clear, northern Wisconsin and western UP lakes: Musky Hunter and In-Fisherman articles on turnover, suckers, gliders, and the cisco bite.
8. Lindsley Lake: at 46 ft it is the second basin. Find any survey.

Facts that cannot be verified by tomorrow ship labeled unverified in the app.

## 8. Error handling

| Failure | Behavior |
|---|---|
| No signal | Forecast panel shows forecast age. Inputs editable. Planner and log work. |
| Open-Meteo down | Try NWS. Then use cached. Then ask for manual inputs. |
| GPS denied or unavailable | Pick spot from list. Event stores no coordinates. |
| Storage denied or full | Warn. Offer export. Photos disabled until space is freed. |
| Content file fails validation at load | Show which file. Use last cached copy. |
| New version | Banner. Reload on tap. Never forced mid-trip. |
| Import file invalid | Reject with the reason. No partial import. |

Nothing blocks the planner or the log.

## 9. Testing

- `test/engine.test.js`: fixtures of condition objects and expected top window, spot type, and lure family. One fixture per fall pattern at minimum. Run with `node --test`.
- `test/astro.test.js`: moonrise, moonset, and phase for known dates at the chain against published almanac values, within two minutes.
- `test/content.test.js`: every JSON file parses; required fields present; every `sources` id exists; every spot's lat and lon fall inside the chain's bounding box; every lesson link target exists; every lake has a rules id; every rulebook has a verified date.
- On-phone checklist before calling version one done: install, airplane mode open, plan Thousand Island today, log a follow in three taps, log a catch with photo, export JSON through the share sheet, reload after a new publish.

## 10. Phases

**Phase 1, 2026-10-02.** Everything in sections 3 to 6 at version-one depth. Twelve lessons with the fall sections and lesson 12 at full depth and the rest outlined. Fifteen lake records. Seeded spots on five lakes. Lure catalog. Fall pattern rules. Planner. Log with photos. Export. Published on GitHub Pages.

**Phase 2, the week after.** Remaining lake maps and spots. Patterns mined from past fall reports. Spot statistics from the log. Own-log bonus in the planner. Moon-clock chart of your own fish.

**Phase 3, if wanted.** Offline map view with spots drawn on it. A copy for Dad with his own log.

## 11. Publishing steps

1. `gh repo create trmnmc/cisco-musky --public --source=. --push`. Approved by Truman on 2026-10-01.
2. Enable Pages from the main branch root.
3. Open the URL in Safari on the iPhone, Add to Home Screen.

## 12. Assumptions

- Units: °F, mph, feet, inches. Pressure is shown in inHg with the trend in inHg per 3 hours, because that is what US anglers read. It is stored in hPa as Open-Meteo returns it.
- Timezone: America/Chicago. Gogebic County is on Central time.

- Water temperature comes from the fish finder. The planner never estimates it unless the field is empty.
- Both anglers fish from one boat. One phone is enough.
- The 2026 Michigan digest and the 2018 Wisconsin classification are current. Rules carry a verified date and the app shows it.
- Seeded spots are reasonable readings of public maps and reports, not local knowledge. The app says so until a trip verifies them.
