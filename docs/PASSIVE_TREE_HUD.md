# Passive Tree HUD

Passive Tree HUD is ExileQuesting's read-only bridge between imported build guidance and Path of Exile's passive/Ascendancy trees.

The v0.2.4 live-client test proved that continuously trying to recognize and register the passive tree from screenshots was the wrong architecture. Ordinary gameplay could look enough like a field of passive nodes to false-positive, and a wrong visual constellation could produce a confident but incorrect transform. The same capture loop also consumed resources while the player was not using the tree.

The current design deliberately removes that entire runtime path.

## Runtime contract

Passive Tree HUD does **not** capture Path of Exile.

It does not use Electron `desktopCapturer`, image matching, radial node detection, OCR, point-cloud registration, polling screenshots or a continuous pan/zoom tracker. There is no background visual work while the player is mapping, fighting or standing in town.

The HUD starts hidden and cannot appear merely because Path of Exile launches. It is shown or hidden explicitly with:

- `Ctrl+Shift+P` — toggle Passive Tree HUD
- `Ctrl+Shift+C` — recenter the saved transform at the mouse cursor
- `Ctrl+Shift+Up` — increase tree scale by 2%
- `Ctrl+Shift+Down` — decrease tree scale by 2%
- `Ctrl+Shift+0` — reset the calibration estimate

The transparent HUD renderer remains static between state changes. It has no infinite animation loop.

## Why calibration is intentional

This follows the proven class of solution used by Exile-UI rather than trying to infer an arbitrary live transform from the whole game screen.

Exile-UI's current passive-tree schematic workflow requires the in-game tree to be fully zoomed out, lets the user align the overlay, and provides a quick recenter mechanism because Path of Exile can reset the tree position after relogging. XileHUD likewise exposes its passive-tree UI as an explicit hotkey-driven feature instead of an always-running visual detector.

ExileQuesting keeps its own GGG-coordinate renderer, but adopts the simpler lifecycle:

1. open the in-game passive tree;
2. fully zoom it out;
3. press `Ctrl+Shift+P` to show ExileQuesting's tree HUD;
4. hover the centre of the class-start circle (or current Ascendancy start) and press `Ctrl+Shift+C`;
5. if needed, use `Ctrl+Shift+Up` / `Ctrl+Shift+Down` until the nearby route dots sit exactly on their in-game nodes;
6. press `Ctrl+Shift+P` when leaving the tree.

Calibration is persisted per display resolution, DPI scale and tree scope. Recentring preserves the learned scale, so after the first setup the common relog/tree-reset recovery is one cursor placement plus `Ctrl+Shift+C`.

## Geometry

ExileQuesting still uses the bundled, validated public GGG passive-tree snapshot. Fixed node coordinates are projected through a simple transform:

`screen = tree * scale + offset`

There is no class-specific screen-coordinate table. The class start is resolved from GGG class data, and Ascendancy roots are resolved from their own local scope.

The initial uncalibrated estimate fits the current scope into the display with conservative margins. That estimate is only a starting point. The HUD marks itself as needing calibration until the player anchors it to the real tree.

## Build-source semantics

### Maxroll

A compatible Maxroll planner exposes ordered allocate/refund operations. ExileQuesting can therefore show one exact `NEXT PASSIVE` or `REFUND PASSIVE` target, plus nearby ordered route dots.

### Path of Building

PoB tree stages contain allocation sets, not a source-authored click order. ExileQuesting highlights stage additions and does not pretend PoB supplied an exact sequence that is not present in the file.

A separately reviewed derived-order feature may be added later, but it must be clearly labelled as ExileQuesting-derived and fail closed around ambiguous refunds, masteries and special allocation mechanics.

## Passive-point availability

A trusted current `/passives` snapshot can prove that zero unspent points are available, in which case the HUD stays hidden. Path of Exile does not continuously log every allocation and point gain, so ExileQuesting does not treat stale `/passives` data as a permanent live counter and does not read process memory to obtain one.

Because the new HUD is explicitly invoked, unknown point state never causes it to appear on its own.

## Screen capture compatibility

ExileQuesting is not protected media. Its windows must remain capturable by OBS, Discord, Windows Game Bar and other normal capture software.

The old Passive Tree HUD enabled Electron content protection to avoid capturing its own overlay. That could map to Windows capture-exclusion APIs and was unnecessary once the screenshot-based HUD was removed. The application now forces content protection off at startup.

## Display assumptions

Calibration is tied to display ID, resolution, DPI scale and passive-tree scope. If those change, recalibrate.

The intended workflow is a full-screen or borderless Path of Exile client with the passive tree fully zoomed out. The HUD does not claim automatic correctness for arbitrary window offsets or arbitrary tree zoom levels.

## Safety boundary

Passive Tree HUD is visualization only. It never reads Path of Exile process memory, injects into the game, moves the cursor, sends gameplay input, clicks nodes, allocates/refunds passives or automates play.

## Permanent regression contract

Automated checks must enforce that the Passive Tree HUD service does not import/use `desktopCapturer`, the old node detector, point-cloud registration or game-window capture. The app startup path must also keep Electron content protection disabled.

Windows release gates still render the passive HUD matrix, run overlay lifecycle checks, build the NSIS installer and exercise the real previous-release updater handoff. The final alignment check remains a live-client calibration test because only the player's real game renderer can establish the saved display transform.
