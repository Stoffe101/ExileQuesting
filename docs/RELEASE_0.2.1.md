# ExileQuesting v0.2.1 release validation

v0.2.1 is the Passive Tree HUD release.

## Player-facing scope

- Visual guidance over Path of Exile's own passive-tree canvas.
- Data-driven support for all seven base classes and their distinct GGG start nodes.
- Exact Maxroll allocate/refund targets when the imported guide exposes ordered passive history.
- Safe Path of Building stage highlighting when the source exposes sets but not a trustworthy click order.
- Scope-local visual registration for fixed Ascendancy subtrees in the bundled PoE 3.29 data.
- Pan, zoom, monitor, ultrawide, 4K and DPI-independent placement using a live tree-space to screen-space transform.
- Off-screen target guidance and fail-closed behavior when the visible tree cannot be registered confidently.

## Current PoE 3.29 geometry contract

The bundled snapshot validates 3,389 named passive definitions, including 2,429 fixed base-tree nodes, 402 explicitly dynamic definitions and 558 fixed Ascendancy nodes across 37 GGG-published scopes. Each included Ascendancy scope has one unambiguous root and complete local group/orbit placement.

## Windows visual evidence

The permanent Passive Tree HUD harness exercises base-tree and Ascendancy allocate, refund, PoB-stage and off-screen states at 1920x1080, 2560x1440, 3440x1440 and 3840x2160 under 100%, 125% and 150% device scale factors.

Electron offscreen rendering can expose updated DOM state slightly before the compositor paints it at fractional DPI. The harness therefore waits through animation frames, invalidates the offscreen surface, discards a warm-up capture and only then records the screenshot used as release evidence. This prevents a stale previous-state frame from being accepted merely because DOM assertions already passed.

## Release boundary

Automated gates cover data/schema validation, transform math, false-match rejection, packaged Electron rendering, the visual matrices, NSIS creation and the real previous-stable to candidate updater/relaunch/uninstall path. The first in-game run remains the final calibration against the exact pixels produced by the player's Path of Exile graphics/UI settings. A weak live match must hide/search rather than draw an unproven marker.
