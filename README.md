# ExileQuesting

ExileQuesting is a modern Path of Exile campaign companion focused on one promise:

> Get from Twilight Strand to maps without wondering where to go, what to collect, or why the route is asking you to do it.

The current `0.1.0` foundation provides:

- a complete Acts 1–10 route derived from Exile-UI's proven campaign data;
- a readable annotation layer with beginner explanations, warnings, and speedrun cues;
- automatic area tracking through the log file the user explicitly selects;
- a compact always-on-top overlay plus a full desktop manager;
- league-start, optional-objective, guidance-depth, and bandit route settings;
- manual next/back controls when automatic detection is unavailable;
- staged upstream updates with structural validation and a last-known-good fallback;
- diagnostics, persistent settings/progress, configurable global hotkeys, and tray controls;
- a real Windows NSIS installer and a separate portable `.exe` build.

## Safety boundary

ExileQuesting observes and advises. It does not play Path of Exile.

The application may read `Client.txt`/`LatestClient.txt` after making that behavior visible to the user. It does not read process memory, inject code, modify game files, inspect network traffic, click, move the character, craft, use skills/flasks, or trigger game input in response to a timer/log/screen event.

This product is not affiliated with or endorsed by Grinding Gear Games in any way.

## Development

Requirements:

- Node.js 24+
- npm 11+

```bash
npm install
npm run dev
```

Validation:

```bash
npm run typecheck
npm test
npm run build
```

Windows packages:

```bash
npm run dist
```

`release/` will contain both an NSIS setup executable and a portable executable. The GitHub Actions Windows workflow performs the authoritative Windows packaging test and uploads both files as a workflow artifact.

## Campaign data updates

The bundled route is pinned to an exact Exile-UI commit. At runtime, ExileQuesting:

1. asks GitHub whether Exile-UI's `main` commit changed;
2. downloads changed campaign files to memory;
3. validates act count, route shape, area data, step count, and unresolved references;
4. writes the accepted data atomically to the app data folder;
5. keeps the previous verified dataset active if any step fails.

The application never activates a new upstream file just because it exists.

## Project direction

The architecture reserves independent modules for:

- PoB import and build-stage understanding;
- gem acquisition and link transitions;
- passive-tree milestones;
- build-specific loot-filter generation;
- gear checkpoints and resistance repair;
- a step-by-step Crafting Coach with clipboard item validation;
- route splits, run history, and personal-best comparisons.

See [docs/RESEARCH.md](docs/RESEARCH.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and [docs/ROADMAP.md](docs/ROADMAP.md).

## Attribution and license

ExileQuesting's source is MIT licensed. Campaign data derived from Exile-UI remains subject to its MIT license and attribution. XileHUD was studied as a GPL-3.0 reference; no XileHUD source is incorporated into this MIT codebase. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

