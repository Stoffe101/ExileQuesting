# Build-aware vendor search

ExileQuesting can turn the active Build Profile stage into short Path of Exile vendor-search expressions.

The goal is not to replace general-purpose regex generators. It is to answer a narrower question during leveling: **“what should I search this vendor for right now for this build?”**

## Workflow

1. Import/select a PoB or Maxroll Build Profile.
2. Let ExileQuesting select or manually choose the current build stage.
3. Open **Build Planner → Build intelligence**.
4. Under **Vendor search · active stage**, copy the relevant generated search.
5. Open the appropriate vendor in Path of Exile and paste the text into the vendor search box yourself.

ExileQuesting never focuses the game, types, pastes, clicks, buys or sends simulated input. Copying the generated text is the end of the application's action.

## Gear vendor scan

The equipment search is assembled in priority order from conservative campaign signals that ExileQuesting already knows:

- the highest active-stage link target of 3 links or more;
- movement speed, because movement-speed boots remain a high-value leveling check;
- non-unique active-stage equipment bases exposed by the current PoB/guide stage.

Weapon/offhand/quiver bases are packed before boots, then body armour and other armour slots. Lower-priority alternatives are omitted if necessary to stay inside the search-box limit.

### PoE 3.29 socket semantics

ExileQuesting does **not** require particular socket colours for the vendor search. In PoE 3.29 every gem can be placed into every equipment socket colour; matching non-white colours are an optional gem-quality bonus instead of a compatibility gate.

For a link target of `N >= 3`, the generated search uses a conservative tooltip expression shaped like:

```text
sockets: ([rgbw]-){N-1}[rgbw]
```

This checks for a linked group containing at least the requested number of normal equipment sockets. Two-link searches are deliberately skipped because they create too much noise for too little campaign value.

## Gem vendor scan

The gem search is more selective than “all gems in the stage.” A gem is included only when:

- it is a currently planned gem task;
- its preferred acquisition source for the active stage is a **vendor**;
- the task is not unresolved or unavailable.

Quest rewards and starting gems therefore do not clutter the vendor search.

Duplicate gem names are removed before packing.

## Regex safety and the 250-character limit

Path of Exile vendor search has a 250-character limit. ExileQuesting enforces that limit before presenting a search.

Build-derived names are escaped as literal regex text before being joined with `|`. The planner packs higher-priority alternatives first and reports when lower-priority entries were omitted because the complete expression would exceed 250 characters.

The UI always shows the final character count, for example `143/250`.

## What the search means

The alternatives are joined with regex OR semantics. A highlighted vendor item can therefore match **any** included target. A gear search that contains a link expression, `movement speed`, and two base names is intentionally broad enough to scan a vendor page quickly.

A highlighted item is not automatically an upgrade. Gear Coach remains the place to evaluate an actual copied candidate against the active build stage and, when supplied, the currently equipped item.

## Clipboard behavior

Copy is an explicit button action. The manager first attempts the browser Clipboard API and uses a user-triggered selection-copy fallback if the sandboxed renderer does not permit it.

The generated search remains visible and selectable, so the player can always copy it manually if operating-system clipboard access is blocked.

No continuous clipboard monitoring is involved.

## Boundaries

Vendor search does not:

- inspect vendor inventories automatically;
- read Path of Exile process memory;
- inject into the game client;
- focus the game window;
- send keyboard or mouse input;
- paste automatically;
- buy items;
- claim that every highlighted item is an upgrade;
- attempt general-purpose regex minimisation or reproduce third-party regex-generator implementations.

The feature is deliberately a stage-aware planning layer built from ExileQuesting's own normalized build data.

## Live-play validation

The expression planner is regression-tested for packing, escaping, task selection, deduplication and the 250-character ceiling. The first live campaign playtest should additionally verify the rendered vendor-search behavior against the current Path of Exile client UI and capture any tooltip/search-language changes as versioned regression cases.
