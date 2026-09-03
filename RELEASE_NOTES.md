# ExileQuesting v0.2.3

This release hardens build-guide support and campaign intelligence around the current Path of Exile 3.29 ecosystem.

## Highlights

- Audited 109 current Maxroll PoE build-guide URLs, successfully parsing 106 and identifying 103 leveling-relevant guides, including Twink routes.
- Added Mobalytics PoE1 guide recognition and a safe PoB/POBb.in bridge while direct application fetching remains blocked by Mobalytics.
- Added deterministic Mobalytics embedded-state parsing for future direct support when a stable public access path exists.
- Updated build-aware vendor link searches to current compact PoE/poe.re regex forms while retaining the 250-character safety limit.
- Added explicit Siosa and Lilly campaign checkpoints so gem-progression changes are explained at the moment they matter.
- Added a scheduled upstream watchdog for representative Maxroll normal/Twink contracts, Mobalytics access changes, and pinned gem/passive data drift.
- Expanded campaign and provider documentation with a cross-source leveling-guide audit and repeatable future-league maintenance process.

## Reliability

The release pipeline validates typechecking, unit tests, bundled gem/passive data, campaign audit/lint/simulation, Pre-playtest Lab controls, manager/Gear Coach/overlay/Passive Tree HUD visuals, overlay lifecycle soak, NSIS packaging, installer verification, and a real previous-stable to current updater handoff with relaunch and post-update smoke testing.

ExileQuesting remains advisory: it does not inject into Path of Exile, read process memory, or automate game input.
