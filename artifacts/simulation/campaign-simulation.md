# Pre-playtest campaign simulation

Generated: 2026-09-04T17:49:06.369Z
Bundled campaign: 2bbbd05237b11be19774979dd4e64ec982f31c0c

| Scenario | Result | Enabled pages | Auto | Manual | Duplicates | Backtracks | Errors |
|---|---:|---:|---:|---:|---:|---:|---:|
| League start · all optional · kill all bandits | PASS | 213 | 212 | 1 | 424 | 19 | 0 |
| League start · optional hidden | PASS | 189 | 188 | 1 | 376 | 17 | 0 |
| Twink/non-league-start · all optional | PASS | 194 | 193 | 1 | 386 | 16 | 0 |
| Bandit · Alira | PASS | 213 | 212 | 1 | 424 | 19 | 0 |
| Bandit · Kraityn | PASS | 213 | 212 | 1 | 424 | 19 | 0 |
| Bandit · Oak | PASS | 213 | 212 | 1 | 424 | 19 | 0 |

## Default-route detail

# Offline campaign simulation

Generated: 2026-09-04T17:49:06.345Z

- Result: **PASS**
- Route pages: **228** (213 enabled for this route profile)
- Acts visited: **1, 2, 3, 4, 5, 6, 7, 8, 9, 10**
- Automatic advances exercised: **212**
- Manual/internal objective completions exercised: **1**
- Duplicate/display-name events injected: **424**
- Backtrack probes injected: **19**
- Largest automatic jump: **8 raw page(s)**
- Errors: **0**
- Warnings: **1**

## Issues

- **WARNING · ambiguous-backtrack** page 155: Backtrack probe for 2_7_5_1 also matches the immediate next route transition.

The simulator intentionally mixes verified internal area IDs, duplicate display-name events, manual objective completion and periodic backtrack probes. A bounded recent-area history prevents a true backtrack from being mistaken for a later copy of the same route area, while an immediate return that is exactly the current objective remains valid. It does not replace final in-game testing of GGG log timing or Windows overlay behavior.


## What this proves

- All ten acts can be traversed through the same normalized route and progression engine used by the app.
- Duplicate internal-ID/display-name events are exercised instead of assuming one perfect event per zone.
- Periodic backtrack probes verify that revisiting a recent zone cannot silently move route progress backwards or skip to a distant repeated area.
- Conditional league-start, optional-content, and bandit profiles are exercised independently.

## What still requires the real game

- GGG client log timing/order changes that are not represented in captured fixtures.
- Windows always-on-top/click-through behavior against the actual game window.
- Human readability while actively fighting and mixed-DPI monitor placement.
