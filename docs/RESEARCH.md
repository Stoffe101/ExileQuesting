# Research dossier

Research date: 2026-09-01

This document records the evidence behind ExileQuesting's first architecture. It intentionally separates facts observed in source/documentation from product inferences.

## Executive conclusion

There is no shortage of Path of Exile overlays. The unsolved problem is integration and explanation.

Existing tools prove that these pieces work:

- automatic campaign progress from `Client.txt`;
- compact always-on-top route instructions;
- PoB gem/tree/notes parsing;
- route variants for league start and twink characters;
- layout hints, experience guidance, timers, and manual correction;
- clipboard-based item parsing;
- Windows installers and background application updates.

Most existing tools optimize for one of two audiences:

1. racers who already understand terse instructions; or
2. power users willing to configure several separate tools.

ExileQuesting should optimize for a returning or learning player who wants a fast route but still needs to know what an instruction means, what must not be missed, and how their build changes the next decision.

## Sources inspected

### Primary projects

| Project | Current role | Useful findings | License implication |
|---|---|---|---|
| [Exile-UI](https://github.com/Lailloken/Exile-UI) | Main upstream campaign reference | 228 route pages, conditions, area IDs, layout cues, act tracking, PoB gems/tree, gear tracker, update discipline | MIT permits reuse with attribution |
| [exile-leveling](https://github.com/HeartofPhos/exile-leveling) | Origin/prior art for route and PoB-aware leveling | Typed fragment language, route validation, quest/vendor gem matching, area graph | MIT, but no implementation currently bundled |
| [XileHUD](https://github.com/XileHUD/poe_overlay) | Broad modern reference | Internal area-ID detection, multi-mode overlays, PoB parsing, tree stages, clipboard item parsing, installer/updater patterns | GPL-3.0-only; concepts studied, source not copied |
| [PoE Leveling Overlay](https://github.com/Tysktillan/poe-leveling-overlay) | Focused Electron comparison | Build picker, quest gem matching, progress persistence, notes/tree windows, portable build | MIT; useful proof of scope and packaging pitfalls |
| [ExileCompass](https://github.com/juddisjudd/exilecompass) | Modern Tauri comparison | Compact local-first design, fallback guide sync, modular crafting guides, translations | Useful architecture comparison |
| [PoE Leveling Guide](https://github.com/JusKillmeQik/PoE-Leveling-Guide) | Older AHK route overlay | Auto-hide, experience panel, editable build notes, zone images, configurable hotkeys | Shows enduring UX expectations and scaling limitations |

### Official policy and packaging sources

- [Path of Exile developer documentation](https://www.pathofexile.com/developer/docs/index)
- [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron BrowserWindow guidance](https://www.electronjs.org/docs/latest/api/browser-window)
- [electron-builder NSIS documentation](https://www.electron.build/docs/nsis/)
- [Electron code-signing guidance](https://www.electronjs.org/docs/latest/tutorial/code-signing)
- [GitHub Actions Node build guidance](https://docs.github.com/actions/automating-builds-and-tests/building-and-testing-nodejs)

### Routing and gameplay sources

- [Exile-UI Act Tracker wiki](https://github.com/Lailloken/Exile-UI/wiki/Act%E2%80%90Tracker)
- [TytyKiller speedrun breakdown](https://www.pathofexile.com/forum/view-thread/2679955)
- [PoE Wiki Acts quick guide](https://www.poewiki.net/wiki/Guide:Acts_quick_guide)
- [PoE Wiki experience mechanics](https://www.poewiki.net/wiki/Experience)
- [PoE Wiki vendor recipes](https://www.poewiki.net/wiki/Vendor_recipe_system)
- [Engineering Eternity/_Treb layout compilation discussion](https://www.reddit.com/r/pathofexile/comments/8gz1jz/leveling_and_zone_layout_cheat_sheets/)

Community posts/videos were treated as technique evidence, not authoritative policy or patch data.

## Exile-UI deep audit

Snapshot inspected: `2bbbd05237b11be19774979dd4e64ec982f31c0c` from 2026-08-29.

### Campaign dataset

The PoE1 English default guide contains:

| Act | Route pages |
|---:|---:|
| 1 | 22 |
| 2 | 39 |
| 3 | 31 |
| 4 | 19 |
| 5 | 14 |
| 6 | 22 |
| 7 | 23 |
| 8 | 24 |
| 9 | 17 |
| 10 | 17 |
| Total | 228 |

The area database contains campaign IDs, human-readable names, area levels, alternate map names, and some crafting-bench locations. Route lines use semantic-ish area references such as `areaid1_2_10`, conditional objects for league-start/bandit choices, and tokens for waypoints, quest items, trials, recipes, portals, bosses, directions, hints, and gem rewards.

### What works particularly well

- Route order already encodes efficient waypoint, portal, and relog usage.
- League-start and twink routes are not forced into one compromised sequence.
- Bandit branches are explicit.
- Layout hints appear at the exact route page where they matter.
- Effective-experience guidance reduces accidental over/under-leveling.
- Manual back/forward and fast-forward compensate for ambiguous log events.
- PoB imports connect campaign steps to gems, links, notes, and tree images.
- The latest code prefers `LatestClient.txt` when available, which we mirror.

### What ExileQuesting should improve

- Token-heavy instructions are fast to read only after the user learns the language.
- Step identity is implicit in ordering; annotation attached to raw array index would be brittle.
- Settings and feature discovery carry the complexity of a broad AHK toolbox.
- Beginner explanations, stop conditions, and “why” context are not the primary goal.
- Native AHK controls make modern scrolling, responsive layout, accessibility, and rich content harder.

### Adaptation decision

ExileQuesting does not fork the AHK application. It consumes the MIT-licensed campaign data through an adapter and maps each route page to our own `CampaignStep` schema. Our UI, settings, persistence, updater, annotations, and future PoB/crafting systems depend only on that normalized schema.

## XileHUD deep audit

Snapshot inspected from its `main` branch at research time; package version `0.6.12`.

XileHUD is a large Electron/TypeScript overlay covering PoE1 and PoE2. The repository includes dedicated modules for:

- PoB decompression, XML parsing, trees, gems, items, weapons, and build management;
- multiple historical passive-tree datasets and progression rendering;
- campaign/leveling windows, gem/gear/notes popouts, settings, hotkeys, and window z-order;
- clipboard monitoring and detailed item/modifier parsing;
- GitHub release updates through `electron-updater`;
- local merchant history and a wide catalog of endgame reference tools.

### Ideas worth adopting independently

- Prefer the `Generating level <n> area "<internal ID>"` log event. It avoids localization ambiguity and resolves zones that share display names.
- Offer full, minimal, and interaction/click-through behavior rather than one fixed overlay density.
- Treat PoB as structured build stages, not merely a notes blob.
- Keep gem links, tree progression, gear, and notes available as focused views.
- Put log-path detection, manual selection, and useful error reporting in first-run UX.
- Provide an installer with stable app identity and application-data persistence across upgrades.

### Ideas not copied directly

- XileHUD is GPL-3.0-only. Incorporating its source would require ExileQuesting as a combined work to follow GPL distribution requirements. ExileQuesting is currently MIT, so the implementation in this repository is independent.
- XileHUD's very broad feature surface creates a large main process and many windows. ExileQuesting starts with a small campaign core and module boundaries before adding build/crafting scope.
- Some current XileHUD code indicates zone detection work exists in more than one UI path. ExileQuesting centralizes log watching in one main-process service.

## Other application findings

### PoE Leveling Overlay

This focused Electron app proves that a portable `.exe` can combine route tracking, local PoB XML discovery, quest-aware gem rewards, passive tree, notes, configurable hotkeys, tray behavior, and per-character progress.

The current implementation is a single large CommonJS main file with synchronous file access and platform-native keyboard calls. That is efficient for a small personal utility but is exactly the structure that becomes hard to diagnose when a packaged application freezes. ExileQuesting instead uses:

- isolated renderer processes;
- a narrow preload API;
- async I/O for log growth and network updates;
- uncaught-error logging;
- atomic settings/progress writes;
- explicit startup failure reporting;
- a build/test pipeline before packaging.

### ExileCompass

ExileCompass demonstrates a smaller Tauri binary, rich localization, modular guide files, synced offline fallback data, and a good separation between campaign, rewards, regex, craft guides, and build import.

Tauri remains a credible future migration option. Electron was chosen for the first implementation because the current workspace can compile and test it completely, Windows overlays are well proven in the compared tools, and using one Node/TypeScript toolchain reduces first-release uncertainty. Binary size is accepted as a tradeoff for faster reliable delivery.

### Older AHK tools and Path of Leveling

Long-lived expectations are consistent:

- automatic progress must always have manual correction;
- guides must work in windowed or borderless mode;
- hotkeys must be configurable and scope-conscious;
- DPI scaling and multiple monitors cannot be ignored;
- stale zone images can be worse than no image;
- auto-hide is useful, but unexpected disappearance is frustrating;
- users want build notes, gems, tree, and route without alt-tabbing.

## Speedrun/routing findings

### 1. Reduce non-movement time first

Town visits, inventory evaluation, passive planning, gem selection, and browser lookup are the largest controllable pauses for non-racers. A build-aware checklist can save more time than perfect execution of one rare layout tell.

Product consequence: route pages need build actions and vendor targets before the town panel opens.

### 2. Movement speed compounds across the whole run

Movement-speed boots, Quicksilver uptime, and a usable movement skill pay off in every subsequent area. Early vendor checks are valuable, but repeated broad vendor browsing is not.

Product consequence: show precise vendor/search reminders at planned town stops and stop reminding once the need is satisfied.

### 3. Kill based on density and level delta

The official experience formula includes a safe zone that grows with character level. Racers commonly stay below area level and selectively kill dense packs, especially magic monsters, rather than full-clearing or fighting every rare.

Product consequence: show current/area level and a simple state—behind, efficient, or overleveled—without teaching players to chase a single fixed `-3` rule at all levels.

### 4. Relog, portal, and waypoint routing is fundamental

Logging to character selection returns the character to the last town. Portals turn branching zones into loops. Waypoint activation order determines whether optional permanent rewards are cheap or expensive.

Product consequence: these actions must be first-class route tags with a short explanation in beginner mode and a compact icon in racer mode.

### 5. Layouts have probabilistic tells, not guaranteed maps

Useful cues include roads, streams, shorelines, wagons, carpet direction, waypoint orientation, room size, arena/start corner relationships, and repeating stair rotations. Random generation means the tool must state confidence and avoid presenting a clue as certainty.

Product consequence: future layout annotations should include confidence and evidence. Static images should be versioned independently and disabled when stale.

### 6. Build preparation is part of routing

Fast players know gem purchases, links, sockets, passive milestones, weapon upgrades, and transition levels before the run. Generic routes cannot eliminate build-specific town time.

Product consequence: PoB understanding is the next major functional milestone after the route foundation.

### 7. Permanent rewards must be explicit

`/passives` is the authoritative in-game audit for missed passive quests. A speed route may skip story/loot quests but should not silently skip permanent power.

Product consequence: tag each permanent reward, provide act totals, and add a pre-maps `/passives` checkpoint.

## GGG policy boundary

GGG's current developer documentation states that independently running executable apps are permitted, though not encouraged; reading game logs is allowed when the user is aware; and game-affecting macro actions must be manually invoked, fixed-function, and limited to one action. Software that interacts with the game or game files is described as strictly against the Terms of Use.

ExileQuesting therefore enforces these product rules:

Allowed in the design:

- read the user-selected log;
- parse PoB exports and public data;
- display overlays, calculations, reminders, timers, and local history;
- read an item the user manually copies;
- open external reference pages;
- copy text to the clipboard after a user click.

Forbidden in the design:

- process-memory reading or DLL injection;
- runtime game-file modification;
- screen/log/timer-triggered game inputs;
- automated crafting, inventory clicks, flasks, skills, movement, or chat;
- one hotkey performing multiple game actions;
- reverse engineering undocumented game/API endpoints.

Risk can never be represented as zero. The app includes a visible non-affiliation notice and exposes log use in Settings.

## Installer and freeze failure analysis

The previous problems described by the project owner—applications freezing during install/start, an installer working but the installed app failing, and poor-looking packaging—typically come from a combination of:

- blocking network/download/build work on the UI thread;
- development paths that do not exist inside the packaged archive;
- writing settings beside the executable in a protected installation directory;
- spawning a second instance or updater during first-run installation;
- hidden renderer errors with no persistent diagnostic log;
- loading unpackaged native modules that do not match Electron's ABI;
- no Windows-runner packaging test;
- no distinction between installer and portable storage expectations.

Mitigations implemented in `0.1.0`:

- network and log work run asynchronously in the main process;
- renderer displays only after `ready-to-show`;
- static campaign data is an explicit packaged resource;
- mutable data lives under Electron's per-user application-data directory;
- settings/progress are atomic JSON writes;
- a single-instance lock is acquired before windows are created;
- renderer has `nodeIntegration: false`, `contextIsolation: true`, and sandboxing;
- global startup/rejection logging writes a known diagnostic file;
- the app falls back to bundled data when cached data is malformed;
- both NSIS and portable targets are built on `windows-latest`;
- CI runs type checking, unit tests, and production renderer/main builds first;
- app ID remains stable so upgrades/uninstall identity is not accidentally broken.

Remaining distribution reality: unsigned Windows binaries can trigger SmartScreen. That cannot be honestly “coded away”; a trusted code-signing certificate is required for the best installation experience.

## Product requirements derived from the research

### Must be in the foundation

- complete route and offline fallback;
- semantic normalized schema;
- beginner/balanced/racer presentation;
- automatic internal-area-ID tracking plus manual controls;
- league-start, optional, and bandit branches;
- clean scrolling at every constrained panel;
- overlay scaling, opacity, click-through, and persistence;
- visible data/version health;
- staged upstream updates and last-known-good activation;
- diagnostics and Windows packaging CI;
- attribution and safe-tool boundary.

### Next major milestone

- paste PoB code or `pobb.in` link;
- decode and validate without blocking UI;
- understand named tree, gem, and item stages;
- show exact quest/vendor gem plan by class;
- show link colours/counts and transition checkpoints;
- attach build reminders to semantic campaign steps;
- create a leveling filter/search plan;
- persist by build + character.

### Later module

Crafting Coach should use independently sourced, licensed PoE data and optional supported integrations. It should convert build gear into weighted goals, offer budget/recommended/high-end paths, explain every action, and validate the manually copied item at stop conditions. It must never automate crafting.

