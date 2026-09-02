# Game-data provenance and integrity

ExileQuesting is designed to keep its build, gem, passive-tree, loot, and future crafting intelligence usable without depending on live third-party services during play. Bundled game data is therefore treated as a versioned release input, not an opaque JSON folder.

## Unified manifest

`assets/game-data/manifest.json` is the common provenance contract for every bundled game-data snapshot.

Each dataset entry records:

- a stable dataset identity;
- an independent `datasetRevision` that is not tied to the ExileQuesting application version;
- the exact bundled filename;
- the dataset schema version;
- the Path of Exile game version;
- the snapshot generation timestamp;
- exact UTF-8 file size;
- SHA-256 of the complete bundled file;
- source kind and source URL;
- source repository/revision when the source is Git-backed;
- source license when one is explicitly declared by that upstream source;
- exact source paths used to generate the normalized snapshot.

The manifest itself is schema-validated with bounded strings, bounded collection sizes, HTTPS-only source URLs, traversal-safe relative paths, unique dataset IDs/files, and strict SHA-256 syntax.

## Independent dataset revisions

Dataset revisions change only when that dataset's complete bundled file changes.

For example, changing the gem acquisition snapshot increments only `gem-acquisition`, while an unchanged passive snapshot retains its existing revision. This lets diagnostics and future compatibility logic discuss a concrete data revision without pretending the application version and data version are the same thing.

The manifest generator preserves the previous revision when the file SHA-256 is identical and increments it when the payload file changes.

## Runtime verification

The canonical bundled files are not trusted merely because they parse.

When ExileQuesting loads `gem-acquisition-3.29.json` or `passive-tree-3.29.json`, the loader automatically requires the adjacent manifest and verifies:

1. manifest schema and required dataset entries;
2. expected filename;
3. exact file byte length;
4. complete-file SHA-256;
5. dataset schema version;
6. Path of Exile game version;
7. generation timestamp;
8. source provenance expected for that dataset;
9. the dataset-specific semantic schema.

The passive tree additionally retains its normalized-node payload checksum. That means the passive snapshot has both complete-file integrity and a domain-specific checksum over the normalized node data used by Passive Tree HUD.

If the manifest is missing, malformed, stale, or disagrees with the actual bundled file, the canonical runtime dataset fails closed instead of being used for build guidance.

## Gem data

Gem acquisition data is generated from a pinned revision of `HeartofPhos/exile-leveling` and normalized into ExileQuesting's local schema.

The exact repository, commit, source files, and MIT license are retained in the snapshot and manifest. The runtime manifest now closes an earlier integrity gap where a schema-valid but modified gem file could otherwise have been accepted.

The application does not need `exile-leveling`, GitHub, or any other remote service during play.

## Passive Skill Tree data

Grinding Gear Games' developer documentation identifies `grindinggear/skilltree-export` as the supported Path of Exile 1 Passive Skill Tree data export.

The passive generator is therefore pinned to an exact `skilltree-export` commit and reads its `data.json` directly. It no longer extracts a JavaScript object from the interactive Path of Exile passive-tree webpage.

The current generator pin is deliberately explicit rather than following the repository's moving branch. Updating the pin is a reviewed data change.

A generated passive snapshot records:

- the official export repository;
- pinned commit;
- source path;
- exact GitHub source URL;
- normalized node checksum.

The manifest separately records the checksum of the complete generated snapshot file.

## Refresh workflow

Gem and passive refresh jobs update the snapshot and manifest atomically:

1. generate the pinned dataset;
2. regenerate the provenance manifest;
3. run the dataset validator;
4. validate the manifest against the generated files;
5. commit the dataset and manifest together only when something changed.

This prevents a refreshed data file from landing with stale provenance metadata.

Normal CI validates the committed manifest. Every production `npm run build` also validates it, which makes Windows visual gates, NSIS packaging, release builds, and packaged startup smoke tests inherit the same provenance requirement.

## Runtime network boundary

The manifest is local metadata. Runtime verification does not fetch GitHub, Path of Exile, PoE Wiki, or another external data service.

Network access is confined to explicit import/update/generation workflows where it is already part of the product design. A player can continue using the verified bundled data if those external services are unavailable.

## Adding future datasets

Future item, modifier, essence, fossil, bench, or other game-data snapshots should be added as new manifest dataset identities rather than inventing a new provenance format.

A new dataset should provide:

- a bounded domain schema and validator;
- independent dataset revisioning;
- complete-file SHA-256;
- game/schema/generated-at metadata;
- exact source identity and source paths;
- explicit license metadata only when the upstream source actually declares one;
- packaged runtime verification before the dataset reaches player-facing guidance.
