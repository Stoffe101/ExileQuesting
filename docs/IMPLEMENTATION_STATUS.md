# Overlay V2 implementation status

This branch continues from merged PR #1 (`v0.1` campaign foundation).

Implemented in this milestone branch:

- glance-first Overlay V2 with Compact / Focus / Coach presentation modes;
- independent Beginner / Balanced / Racer guidance depth;
- configurable overlay typography presets plus advanced font fields and density;
- structured semantic route actions and NOW / NEXT / DON'T MISS hierarchy;
- dynamic content-height reporting and overlay resizing;
- strict Client.txt event parsing;
- hybrid filesystem watcher + polling fallback;
- startup-tail zone inspection and reconciliation;
- Steam library discovery for log detection;
- confidence-rated progress decisions and undoable history;
- XP pacing model using the level-dependent safe zone;
- permanent passive/trial route tracking;
- independent confidence-rated layout hints;
- overlay position presets, snapping, locking, reduced-motion/transparency controls;
- first-run onboarding;
- live-run Overview, inspect-without-mutating Campaign view, expanded Diagnostics;
- data-only remote compatibility manifest validation;
- smarter upstream CI semantic report;
- campaign-content audit tooling;
- expanded core tests.

Still requires real in-game manual validation for overlay sizing/placement across multiple Windows DPI/monitor setups and for progression behavior through full campaign runs.
