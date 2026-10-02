# Cisco Musky: design review

Date: 2026-10-01  
Reviewed: `2026-10-01-cisco-musky-design.md` at commit `520a979`, including the adjustment lesson/notes and the later `fieldbook` privacy and private-spot import changes.  
Status: review complete; corrections proposed, implementation not started.

The static, offline app is a good fit for one boat and one phone. Keep the two voices, measured water temperature, fast logging, photos, and local ownership of the log. The draft needs corrections before it becomes an implementation contract. The largest problem is that some supposedly verified chain information is wrong. The main engineering gaps concern preserving the log and avoiding confident recommendations from missing or stale inputs.

P1 means fix before building the affected content or behavior. P2 means resolve before calling version one complete. These are design findings, not defects observed in a running app.

## 1. P1: Recheck lake identity and depth before using them in fall patterns

**Spec:** §§4.1–4.2, 7.1–7.2.

The 2024 report prepared by Many Waters for the Cisco Chain Riparian Owners Association conflicts with several draft depths:

| Lake | Draft depth, ft | Reported maximum depth, ft |
|---|---:|---:|
| Fishhawk | 8 | 22 |
| Lindsley | 46 | 28 |
| Record | 16 | 20 |
| Clearwater | 10 | 14 |

The report also distinguishes several stratifying basins; the “two deep basins” description should be reconsidered. These are source-reported measurements, not a guarantee of today's soundings. [2024 report, lake-classification table, printed p. 11](https://ciscochainroa.com/News-Events/2024/Cisco.Chain.Water.Quality.Summary-2024.pdf).

There is a likely transcription explanation: SR47 Table 2 lists 8, 46, and 16 for Fishhawk, Lindsley, and Record under **fyke-net lifts**, not depth. That is an inference about how the draft went wrong, not proof of its origin. [Michigan DNR SR47, Table 2, printed p. 42](https://www2.dnr.state.mi.us/Publications/pdfs/DNRFishLibrary/Special-ManagementReports/SR47.pdf).

Mamie's maximum is 15 feet on its current DNR page; the draft's 10 feet should not be used as maximum depth. [WI DNR Mamie, WBIC 2964100](https://apps.dnr.wi.gov/lakes/lakepages/LakeDetail.aspx?wbic=2964100).

The proposed `2334700a.pdf` map is an identity error: WBIC 2334700 is another Big Lake in the Manitowish River watershed. The chain's Big Lake is **2963800**. [Other Big Lake](https://apps.dnr.wi.gov/Water/waterDetail.aspx?wbic=2334700), [Cisco Chain management plan identifying the three boundary-lake IDs](https://apps.dnr.wi.gov/swims/Documents/DownloadDocument?id=165386731). The correct Big Lake page reports 780 acres and 30 feet maximum, and links a July 1969 map. [WI DNR Big Lake](https://apps.dnr.wi.gov/lakes/lakepages/LakeDetail.aspx?wbic=2963800), [linked contour map](https://apps.dnr.wi.gov/swims/Documents/DownloadDocument?id=29818547).

**Change:** Give lakes stable agency IDs where available. Attach source, page/table, measurement type, and date to each numerical claim. Retain conflicting values as attributed alternatives rather than treating their range as a measured uncertainty interval. Do not assign lake character from the current draft depths. Verify seeded points against the correct lake map; the chain's broad bounding box cannot catch a point in the wrong lake.

## 2. P1: Make the boundary rules specific enough to be usable

**Spec:** §4.1 chapter 10, §4.6, §7.1.

“Either state's license valid” is incomplete. Michigan's boundary order distinguishes Michigan/Wisconsin residents with their own state's resident license from residents of other states holding either state's license. It also specifies attended lines, a combined hook/bait restriction, and harvest registration; “three lines” alone omits part of the rule. [FO-205.26, legal fishing methods and Note 2](https://www.michigan.gov/dnr/-/media/Project/Websites/dnr/Documents/Orders/Fish-Orders/FO_205.pdf?hash=AC333CA96A53B40A2C75E23A34880681&rev=9f7ab3176af74cac845668fb39645aba).

The lesson promises three size limits, but the draft only defines two. A search hit for a proposed chain-wide 50-inch limit was not substantiated by the currently linked orders inspected here; do not adopt it from the search excerpt. [DNR orders index](https://www.michigan.gov/dnr/managing-resources/laws/orders/fisheries-orders).

**Change:** Record lake applicability, jurisdiction, effective dates, harvest versus immediate-release rules, residency conditions, and exact source section. Clearly separate a saved fishing log from official harvest registration. On boundary lakes, ask for the applicable side when rules differ or show both. Do not infer jurisdiction from a lake name or imprecise GPS. Complete the Wisconsin-side cross-check before publishing the rules panel. The general Wisconsin inland season is not a substitute for boundary-water rules.

The unresolved pike research is partly answerable now: FO-206.25 expressly names the twelve Michigan-only chain lakes and gives a five-fish daily allowance, with only one at least 24 inches and no minimum size. Keep this separate from boundary rules. [FO-206.25, Gogebic County](https://www.michigan.gov/dnr/-/media/Project/Websites/dnr/Documents/Orders/Fish-Orders/FO_206.pdf?hash=6F6927AF08B4EECE7E40E79EC9257A13&rev=51ea64fa28274ff3aa0f8834fbe6a0ce).

## 3. P1: Specify a backup that can actually restore the photos

**Spec:** §§3.2–3.4, 6.4, 6.6, 8.

The persistence request is not a promise that the phone cannot lose data. WebKit grants it using heuristics; a request can be denied. Asking only before installation also misses the home-screen state used by those heuristics. [WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/).

The JSON backup excludes photos, and there is no photo-import contract. A successful JSON restore therefore cannot restore the whole log. An event also supports both a catch photo and a marks photo, while the proposed single event-ID blob key does not describe how to preserve both.

**Change:** Use unique photo IDs with `eventId` and photo role. Define a versioned backup manifest, filenames, associations, and a supported photo restore path with a download fallback. Either a single archive or JSON plus an explicitly supported set of photo files can work. Check persistence after installation, show its actual status, and offer backup at trip end; retain the monthly reminder as an in-app check.

Validate all import records and references before writing; define duplicate-ID conflicts and commit the merge atomically. Report saved only after storage confirms it. If storage is unavailable, preserve an exportable draft and say it is unsaved. “Nothing blocks the log” cannot mean “the app can always save.”

**Acceptance:** Two photos on one catch survive export and restore into empty storage; an invalid import changes nothing; quota failure does not silently discard a catch; cancelling the share sheet does not count as a completed backup.

## 4. P1: Give recommendations and event snapshots the correct time and missing-data behavior

**Spec:** §§5.1–5.3, 6.1–6.2, 8.

One condition object for a whole date cannot distinguish a calm morning from a windy evening. `timeOfDay` is also a pattern condition but is not a defined day-level input. The current design could recommend an evening window using morning weather. A frozen plan must not become the condition snapshot for every later fish.

**Change:** Score each window with conditions valid at that window; associate the spot/lure ranking with the selected window. Freeze the original plan for comparison, but create a fresh snapshot at each event. Store source, valid time, fetch time, and user-entry time where applicable. Recalculate forecast age when displaying or logging it.

Separate an omitted pattern constraint (unrestricted) from an unknown input (cannot satisfy that constraint). Never substitute zero, “steady,” or today's conditions for missing historical/future weather. Timestamp the last water-temperature reading per lake and request confirmation when reused. Leave an empty temperature unknown instead of inventing an estimate.

Open-Meteo's normal endpoint has a bounded forecast horizon and model-derived past data; “any date” needs a manual/offline fallback. [Open-Meteo documentation](https://open-meteo.com/en/docs). NWS requires its own field mapping, units, and unavailable-field handling, and its documentation says grid mapping can change. Discover it through `/points` instead of permanently hard-coding 86,54. [NWS API documentation](https://www.weather.gov/documentation/services-web-api).

Make hours-since-front manual or unknown in v1 unless a defined, tested heuristic is supplied. Pressure/wind history alone does not specify that algorithm. Use the same pressure convention and provider when computing the three-hour difference.

**Acceptance:** Missing weather, a date outside the cached forecast, a fresh fetch containing old valid times, and a mid-trip weather change all produce honest output and snapshots.

## 5. P2: Resolve the “any lake” promise and finish the ranking contract

**Spec:** §1 success criterion 2, §§4.3–4.5, 5.3.

Only five lakes receive seeded spots. The other ten cannot have a ranked list of actual spots without inventing locations. With the new private-spot pack, even those five have no spots before import. The bonuses, tied scores, overlapping temperature bands, empty matches, and presentation exclusions are also undefined. This prevents independent implementations from producing the same result.

**Change:** For unseeded lakes show explicitly labeled structure-search advice plus any user spots. Say “no mapped spots yet” when appropriate. Specify bonus values and stable tie-breaking; reject lures incompatible with the selected presentation before ranking. Define the no-match result. Explain that ranks are relative suggestions, not a probability of catching a fish. Add explicit lesson IDs to recommendation-bearing records so lesson links can be validated.

## 6. P2: Preserve the distinction between a fact, an inference, and an observation

**Spec:** §§4.2–4.3, 6.7, 7.1, 12.

Fishing a seeded location does not verify its depth, vegetation, or productivity. Dad adding a spot does not turn every associated claim into a sourced fact. A historical summer oxygen profile must not be treated as current October conditions.

There is also an attribution problem in the stocking claim: SR47 Table 1 documents northern muskellunge stocked in **Cisco** in 1981 and Wisconsin muskellunge stockings in Mamie and West Bay in 1985. It does not establish the draft's Thousand Island stocking claim. A later stocking bulletin could, but must be identified. A 2018 “no stocking” management category must not be expanded into “never stocked.” [SR47, Table 1, printed p. 41](https://www2.dnr.state.mi.us/Publications/pdfs/DNRFishLibrary/Special-ManagementReports/SR47.pdf).

**Change:** Separate `sourceReviewed`, `visitedAt`, `observedBy`, and the observation being confirmed. Label Dad's input as his observation. Give dynamic lake facts a survey date/season. Standardize `sources` arrays across spots, lures, rules, lessons, and patterns. Permit null measurements and record-level uncertainty. A source's existence is not verification that it supports every statement attached to it.

## 7. P2: Avoid false precision in the moon clock and the fishing advice

**Spec:** §4.1 chapters 4 and 12, §§5.2, 7.1, 9.

Taking the largest and smallest altitude within a calendar day can select midnight endpoints on a day without the corresponding transit. That invents an overhead/underfoot event. Pin the exact SunCalc release: its current documentation exposes `transit` and `lowerTransit`, allows absent events, and notes breaking changes in v2. [SunCalc documentation](https://github.com/mourner/suncalc#moon-rise-and-set-times).

**Change:** Use the pinned library's documented event semantics or a tested transit calculation; never substitute a day endpoint. Calculate the Chicago calendar day independently of the phone's timezone, test the daylight-saving transition, include adjacent days when finding the nearest event, and define what happens to windows crossing midnight. Validate phase separately from event-time accuracy.

The lunar study reports an overall modeled effect around 5%, with effort confounding and a weaker effect in October than midsummer. It does not establish this app's precise major/minor windows as Cisco-specific feeding probabilities. The 34.7% anecdote is attributed in that paper to Heting/Heiting, not Dettloff. [Vinson and Angradi, 2014, abstract and introduction](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0098046).

The newly saved chapter 12 goes beyond evidence with its required twenty-minute trials, two-window cutoff, and fixed under-55°F response to a follow. Replace these with options driven by observed bait, cover, lure path, and the fish's reaction. Keep the retrieve moving into a wide figure-eight before logging; a return visit is an option, not a promised catch. [Joe Bucher on boatside response](https://www.musky360.com/page-101/i/37159628/figure-8s-101-boat-side-tactics), [Jim Saric on fall observations](https://www.outdoorsfirst.com/muskie/article/fall-musky-forensics-musky-hunter/), [Saric interview on returning to follows](https://www.mercurymarine.com/us/en/lifestyle/dockline/6-musky-fishing-basics-with-jim-saric).

Keep this playbook inside the existing lesson/notes flow. No contact is an observation, not proof of absence. Separate expert tactics from demonstrated Cisco patterns. The optional Dad-reasoning note fits the existing log; it need not add mandatory fields to quick capture.

## 8. P2: Do not calculate lure success rates without lure effort

**Spec:** §§6.1–6.3.

Here-to-Here elapsed time measures a location visit, including travel or breaks. It does not measure time using each lure. Two anglers can use different lures at once, and a sucker may be fishing alongside casting rods. Event counts cannot recover those denominators.

**Change:** In v1, show lure contact counts and clearly labeled contacts per recorded spot-visit hour. If true fishing-effort rates are required, record pause/resume and lure/angler/rod intervals, including intervals with zero contacts. Make that an explicit scope choice rather than silently inferring effort. Every event needs its own lake and angler attribution or a confirmed default, since one trip can cross lakes and both people share the phone. Recover unfinished trips and timers after closing or locking the app using saved timestamps.

## 9. P2: Verify the Lunge Log contract instead of assuming column order

**Spec:** §1 success criterion 4, §§6.2, 6.5–6.6.

The cited 28-field description establishes a historical database, not today's entry form order or supported CSV import. The public site puts the actual Lunge Log behind member login; this review did not inspect that form. [Muskies Inc. database abstract](https://muskiesinc.org/indy_files/files/Muskie%20Symposium%20Lunge%20Log%20Abstract%202017.pdf), [member entry point](https://muskiesinc.org/).

The catch field list also omits an explicit release-status field and confirmed state of capture, even though the export requires them. `states: [MI, WI]` cannot identify which state a fish was caught in.

**Change:** Keep a documented 17-column catch worksheet in the draft's stated order until the current form is checked. Label it for manual transcription, with compatibility unverified. Store explicit release status, capture state or unknown, and angler. Verify the claimed measurement policy separately. Keep unknown values blank, escape CSV quotes/newlines, and make the export timezone and units explicit.

## 10. P2: Test the failure paths that determine whether it works on the water

**Spec:** §§3.1–3.2, 8–10.

Precache alone does not specify when offline readiness is confirmed or how a bad update preserves a usable version. “Use last cached content” fails if an update has already replaced that content or if this is the first load. The latest draft usefully adds a manifest generator and a precache test; §3.2 still contradicts these by saying every listed file is precached, although that list now includes the private seed pack.

**Change:** Validate a complete content release before activating it; keep the previous working release until the new one is usable. Make §3.2 refer to the public runtime manifest, excluding private files, tests, scripts, and documents. Show offline-ready only after that set is available. Use paths relative to the newly chosen `/fieldbook/`, including the manifest and worker scope. [GitHub Pages project URL format](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages). Install first, then import the spots in the installed app and verify them offline. A fresh installation without the pack must remain usable and state what is missing.

Add focused acceptance checks for denied storage/GPS, photo restore, interrupted trips, invalid imports, stale/missing forecasts, no matching patterns, no seeded spots, and updates during a trip. Test on the intended iPhone in installed mode; desktop success cannot finish that checklist. Define the minimum supported iOS version. Keep the original photo/log scope; if the October 2 target forces cuts, defer optional research breadth and automatic front detection before reducing save/restore reliability.

## Recommended disposition

Revise the factual inputs and P1 contracts, then write the implementation plan. This review does not require a new platform, a server, or another broad feature round. The core product remains the same.

The source spec was left unchanged by this review. The separate `ffec4b6` and `520a979` commits already contain lesson 12, adjustment notes, and the private-spots/`fieldbook` changes; those additions were reviewed above, not created or reverted here. This review added only this document and published nothing.

## Verification limits

This is a targeted design/source audit, not verification of every assertion in §7. The large 2026 Michigan digest failed full retrieval (web size limit and direct-download access error); relevant currently linked DNR orders were inspected instead. Wisconsin's full 2026–27 guide download also failed, so complete cross-state rules remain a release task. The current member-only Lunge Log form, every depth map, historical fall reports, stocking database, exact cisco-spawn timing, landing inventory, and actual iPhone behavior remain unverified. The Game & Fish forage article supplied as a possible source could not be retrieved and was not used as evidence.
