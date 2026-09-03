# ExileQuesting v0.2.4

This hotfix rebuilds the Passive Tree HUD around the actual in-game passive-tree lifecycle so it no longer behaves like a permanent full-screen overlay during normal Path of Exile gameplay.

## Passive Tree HUD fixes

- The Passive Tree HUD now stays hidden while the in-game passive tree is closed.
- Normal gameplay uses only a small, low-frequency Path of Exile window probe instead of continuously running full passive-tree registration.
- Accurate node registration starts only after the passive tree is confidently detected.
- Once aligned, ordinary pan and zoom changes are followed by a lightweight local transform tracker; expensive full reacquisition is reserved for larger viewport changes or lost locks.
- Captures target the Path of Exile window rather than continuously processing unrelated desktop pixels.
- Tree-open detection requires passive-node-like geometry distributed through the client interior, reducing false activation from ordinary HUD circles around the screen edges.
- The target ring, route path and labels are now static. Infinite pulse animations, SVG drop-shadow effects and other continuous compositor-heavy decoration have been removed.
- Added explicit waiting states for the tree being closed and for a proven zero-unspent-point state.

## Compatibility and reliability

- Registration remains data-driven from bundled PoE passive-tree geometry, so it is not tied to a single class, build, screen coordinate, resolution or aspect ratio.
- Automated coverage includes 1920x1080, 2560x1440, 3440x1440 and 5120x1440 tree-presence cases, synthetic pan/zoom tracking, false-positive rejection, static-render regression checks, the Windows Passive Tree HUD visual matrix, NSIS packaging and the previous-stable to candidate updater rehearsal.
- Weak or ambiguous visual matches fail closed and hide the marker rather than drawing an unproven position.

The HUD remains advisory only. ExileQuesting does not read Path of Exile process memory, inject into the game, move the cursor or automate passive allocation.
