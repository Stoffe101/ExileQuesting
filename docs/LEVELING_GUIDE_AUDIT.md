# Leveling-guide intelligence audit

This document records the broad guide review behind ExileQuesting's campaign/build-intelligence layer. It is intentionally about **reusable mechanics and progression patterns**, not copied guide prose.

## September 2026 Maxroll corpus

The research pass discovered 109 current public PoE build-guide routes from Maxroll's public guide surfaces. ExileQuesting successfully parsed 106. The three non-parsing routes were category/index-style pages rather than normal build planners. Of the parsed corpus, 103 carried leveling-relevant signals.

The corpus included the dedicated class leveling guides, normal league starters with explicit leveling stages and the class Twink family. Ten pages carried a Twink signal; the canonical class Twink set covers Duelist, Marauder, Ranger, Scion, Shadow, Templar and Witch and currently shares a structured Twink planner.

Representative structured contracts used for continuous monitoring are:

- Explosive Concoction Deadeye leveling: normal league-start planner, multiple level-labelled gem stages and a long ordered passive history;
- Ranger Twink leveling: Twink planner, level checkpoints including the Hollow Palm swap, ordered passives and multiple equipment milestones.

These are probes, not a whitelist. Any Maxroll guide that uses a compatible public planner structure can still be imported.

## Repeated campaign/leveling themes

The corpus was clustered by repeated useful concepts. Raw mention counts are a research signal, not a claim that every mention was unique or should become UI:

| Theme | Corpus signal |
|---|---:|
| crafting / bench progression | 293 |
| gems / gem transitions | 275 |
| waypoint, portal and route shortcuts | 167 |
| links / linked gear | 143 |
| sockets | 115 |
| vendor checks | 106 |
| resistances | 94 |
| boots | 88 |
| movement speed | 69 |
| Labyrinth / Ascendancy timing | 60 |
| vendor regex | 55 |
| loot filters | 46 |
| bandits | 17 |
| explicit build transitions | 15 |
| Hollow Palm | 14 |

This is why ExileQuesting treats vendor search, movement speed, linked gear, gem acquisition, resistance recovery, crafting, permanent rewards and route shortcuts as first-class leveling concerns rather than burying them in one generic tips page.

## What the product already covers

### Route and progression

The Exile-UI-derived route has 228 campaign pages with decisive route-action coverage. It already contains high-value speedrun-style concepts such as waypoint returns, relogs, portal saves, road/wall/edge tells, optional detours, bandit branches, trials and boss checkpoints.

ExileQuesting normalizes those raw instructions into NOW / DON'T MISS / NEXT actions and keeps progression confidence/history so automatic Client.txt advancement can be explained and undone.

### Build progression

PoB and Maxroll builds are normalized into staged build profiles. The active stage can drive:

- skill/gem requirements;
- acquisition sources;
- passive-tree guidance;
- equipment targets;
- Gear Coach;
- build-aware loot-filter targets;
- vendor searches;
- overlay build guidance.

Maxroll skill stages may advance from character-level events. Passive progression stays explicit because character level is not a safe proxy for passive points.

### Gem availability

The gem planner knows class-valid quest/vendor sources plus conservative Siosa and Lilly fallbacks. The campaign layer now explicitly teaches the two important unlock checkpoints:

- A Fixture of Fate -> Siosa becomes an early broad gem fallback in the Library;
- Fallen from Grace -> Lilly Roth becomes the long-term broad gem fallback and hideout vendor.

### Vendor search and regex

The active build stage produces a bounded <=250-character vendor scan for the most useful current link target, movement-speed boots, stage-relevant bases and vendor-acquired gems.

The link expressions are cross-checked against the current PoE1 vendor-search forms used by poe.re rather than frozen to an old tooltip shape. Socket colours are not treated as gem-compatibility requirements in PoE 3.29.

### Gear, defenses and Kitava

Gear Coach handles actual copied candidate items instead of pretending a vendor regex proves an upgrade. Campaign intelligence adds the two Kitava resistance-recovery checkpoints so a newer player is not surprised by the Act 5 and Act 10 resistance penalties.

### Loot filters

Build-aware loot intelligence follows the active gem/link/base targets. Guide-author FilterBlade/NeverSink recommendations are treated as evidence that leveling filters are important, not as content to copy verbatim.

## What was deliberately not generalized

Not every recurring guide statement should become product logic.

ExileQuesting does not automatically generalize:

- build-specific damage rotations;
- exact unique-item shopping advice from one author;
- temporary league-economy pricing;
- author-specific farming recommendations;
- exact Lab level recommendations without build/context evidence;
- a vendor regex copied from one guide;
- a claimed route cause inferred only from run timing.

Those are either build-specific, economy-sensitive or too easy to make stale. When the imported build itself exposes a transition/equipment/gem requirement, ExileQuesting can use that structured fact instead.

## Mobalytics cross-check

Mobalytics was also reviewed as an independent source of campaign/build UX ideas. Current PoE1 build pages expose leveling variants, equipment, passive trees, skill groups and Path of Building integration, and current guide material reinforces the same high-value themes: vendor regex, movement-speed boots, resistances, gem swaps, loot filters, bandits and progression checkpoints.

Mobalytics currently returns HTTP 403 to non-browser application probes from GitHub Actions, so ExileQuesting does not pretend direct URL fetching is reliable. The supported bridge is the build's Path of Building / POBb.in export, which enters the existing hardened PoB importer. A bounded parser for Mobalytics' embedded PoE1 state exists behind deterministic tests so direct import can be enabled later if a stable public fetch path becomes available.

## Continuous review

The scheduled companion upstream monitor separately checks:

- a representative normal Maxroll leveling contract;
- a representative Maxroll Twink contract;
- Mobalytics public-access behavior and whether direct structured import becomes viable;
- the pinned git revisions/paths behind bundled gem-acquisition data;
- the pinned git revision/path behind the passive tree.

A detected contract change opens a review issue. It never silently advances adapters or production data. The last verified build-guide fixtures and bundled PoE datasets remain the fallback.
