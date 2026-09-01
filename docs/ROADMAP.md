# Roadmap

## 0.1 — campaign foundation

- [x] Acts 1–10 route snapshot
- [x] readable markup adapter
- [x] semantic annotation selectors
- [x] beginner/balanced/racer modes
- [x] full manager and compact overlay
- [x] Client.txt/LatestClient.txt tracking
- [x] manual progress correction
- [x] league-start, optional, and bandit branches
- [x] update staging, validation, cache, and fallback
- [x] diagnostics and persistent logs
- [x] NSIS installer and portable build pipeline

## 0.2 — PoB to Play

- [ ] paste export code or pobb.in URL
- [ ] local `.xml` build discovery
- [ ] background decompression and XML validation
- [ ] named gem/tree/item stages
- [ ] class-aware quest reward and vendor plan
- [ ] link colours, socket counts, and gem transitions
- [ ] passive milestone overlay
- [ ] build notes and guide-source link
- [ ] build + character progress profiles

## 0.3 — route intelligence

- [ ] character/area level parsing and experience-band guidance
- [ ] run timer, act splits, pauses, PB/previous comparison
- [ ] missed passive/trial checklist and `/passives` audit
- [ ] confidence-rated layout hints and versioned images
- [ ] build-specific vendor regex/search reminders
- [ ] leveling loot-filter generator
- [ ] first-run onboarding and DPI/multi-monitor placement tools

## 0.4 — Gear Coach

- [ ] manually copied item parser
- [ ] resistance/attribute/life gap analysis
- [ ] gear-slot match score against build stage
- [ ] cheap campaign and early-map upgrade recommendations
- [ ] crafting-bench repair suggestions

## 0.5 — Crafting Coach

- [ ] licensed local modifier/base/essence/fossil/bench dataset
- [ ] essential/important/flexible target decomposition
- [ ] budget, recommended, high-end, and near-BiS strategies
- [ ] probabilities and expected attempts/cost
- [ ] explicit stop conditions
- [ ] item-state validation after manual Ctrl+C
- [ ] “just tell me” and “teach me” explanations
- [ ] optional supported Craft of Exile handoff/integration

## Release requirements for every milestone

- type check and tests pass;
- Windows installer and portable artifact build on GitHub Actions;
- packaged resource paths are exercised;
- startup and failure paths produce diagnostic logs;
- current GGG policy boundary is rechecked;
- third-party data versions and licenses are recorded;
- no upstream update activates without validation.

