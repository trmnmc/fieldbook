# Scout notes: prior art for Cisco Musky

Date: 2026-10-01. Searched with `gh search repos` (cutoff: pushed after 2025-10-01, not archived), two web searches, and an awesome-list check. Every row was verified by reading the README and tree.

## Candidates

| Repo | Stars | Last push | License | Fit | Escape hatch |
|---|---|---|---|---|---|
| PndaMan/Currents | 1 | 2026-08-14 | MIT | ~60%. Offline-first iOS fishing app: spots, catch log, bite forecast, lure engine, field guide. Native Swift for iOS 26, 152 Swift files, 1.9 MB. No musky content, no lessons, no chain data. | forkable, needs Xcode and signing |
| Chris-db/FishCast | 0 | 2026-09-21 | MIT | ~35%. Static no-build PWA scoring a spot's day from solunar, pressure, and Open-Meteo weather. Offline from cache. No lakes, lessons, lures, planner, or log. | vendorable (astro.js 6 KB, engine.js 18 KB) |
| stell619/tide-runner | 1 | 2026-03-16 | MIT | ~40%. Spots, species guide, catch log, score, PWA. Sydney tides. Python server. | forkable |
| cohenadair/anglers-log | 35 | 2026-09-28 | GPL-3 | ~20%. Catch log only. Flutter. 198 open issues. | trapped |
| bairnhard/fishing_assistant | 11 | 2026-02-21 | MIT | ~10%. Home Assistant bite-time scorer. Reference only. | vendorable |
| mourner/suncalc | 3484 | 2026-10-01 | BSD-2 | Library. Sun and moon times and phase, offline. | vendorable, chosen |

Dropped for no license: GavanActon/huntapp (closest shape: one-camp offline map PWA with bathymetry, 100 MB of tiles), MaxSilvestre/fishing-companion, simonclur/FishingSolunar, XavierKain/fishing-log, friskygrape/fishing-app, MadHatter1999/FishingTracker. DevyRuxpin/rhode-island-fishing-guide: unclear license, server, no offline.

## Finding

Nothing musky-specific exists. No awesome-fishing list exists. Queries: musky, muskie, muskellunge, fishing journal, fishing app, fishing log, offline fishing, fishlog, catchlog, `--topic=fishing`, `--topic=fishing --topic=pwa`, `--topic=angling`, `--match name --topic=fishing`, web: "open source offline fishing companion PWA musky", "github awesome fishing angling".

## Verdict

Build. Static no-build PWA, content first, suncalc vendored, FishCast's engine as a reference for condition scoring. Adopt fails on platform and content. Extend fails on fit: FishCast answers one question for one spot, and its weights are tuned for the South African coast.
