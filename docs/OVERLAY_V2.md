# Overlay V2 campaign-experience milestone

## Product rule

The default overlay is optimized for a sub-second glance:

1. **NOW** — the decisive current action.
2. **DON'T MISS** — only critical/permanent information.
3. **NEXT** — the next decisive route action.

Directional/layout clues are context, never promoted above a kill, travel, reward, waypoint, or other decisive action.

## Presentation vs guidance

Overlay presentation and guidance depth are intentionally independent:

- Overlay: `compact`, `focus`, `coach`
- Guidance: `beginner`, `balanced`, `racer`

Focus is the recommended default. Coach progressively discloses teaching, layout context, XP detail, and longer explanations.

## Detection confidence

- `verified`: internal area ID matched a nearby route transition.
- `inferred`: display-name fallback or logically implied transition.
- `manual`: user changed/resumed progress.

Automatic progress keeps bounded history and is undoable. Startup scans only a bounded log tail and never replays the whole previous session.

## Safety

The milestone keeps the existing boundary: ExileQuesting observes logs and displays guidance. It does not read process memory, inject code, automate inputs, or play Path of Exile.
