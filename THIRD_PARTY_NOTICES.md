# Third-party notices

ExileQuesting's own code is licensed under PolyForm Noncommercial License 1.0.0. Third-party material listed here remains under its original license or terms and is not relicensed by ExileQuesting.

## Exile-UI

Repository: <https://github.com/Lailloken/Exile-UI>

Copyright (c) Lailloken and Exile-UI contributors.

ExileQuesting bundles a normalized snapshot of Exile-UI's English Path of Exile campaign guide and area metadata. The bundled snapshot is pinned in `assets/campaign/manifest.json`. ExileQuesting's annotation text and desktop implementation are separate works.

Exile-UI is distributed under the MIT License:

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## exile-leveling

Repository: <https://github.com/HeartofPhos/exile-leveling>

Copyright (c) 2025 HeartofPhos.

ExileQuesting bundles a normalized, application-specific gem acquisition snapshot derived from pinned `exile-leveling` gem, quest, and character metadata. The bundled snapshot does not include the `exile-leveling` application implementation. Its exact source revision and source paths are recorded in `assets/game-data/gem-acquisition-3.29.json` and `assets/game-data/manifest.json`.

`exile-leveling` is distributed under the MIT License:

> MIT License
>
> Copyright (c) 2025 HeartofPhos
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Grinding Gear Games Passive Skill Tree data export

Official data export repository: <https://github.com/grindinggear/skilltree-export>

Grinding Gear Games' Path of Exile developer documentation identifies this repository as the supported Path of Exile 1 Passive Skill Tree data export. ExileQuesting's passive-tree generator is pinned to a specific repository revision and normalizes only the data required by ExileQuesting's passive guidance and Passive Tree HUD. Source revision, source path, generated snapshot checksum, and bundled-file checksum are recorded through the passive snapshot and `assets/game-data/manifest.json`.

No separate open-source license is asserted for Grinding Gear Games' game data here. Path of Exile, its data, names, and related game content remain property of Grinding Gear Games and are subject to Grinding Gear Games' applicable terms and policies.

## Path of Building Community

Repository: <https://github.com/PathOfBuildingCommunity/PathOfBuilding>

Copyright (c) 2016 David Gowor and Path of Building Community contributors.

ExileQuesting uses a pinned Path of Building Community 3.29 revision as the canonical reference implementation for interpreting Path of Exile passive-tree layout invariants. This includes class-start identity, orbit constants, base-tree bounds, node group/orbit interpretation, and Path of Building's documented normalization of scrambled Ascendancy placement. Grinding Gear Games' export remains ExileQuesting's raw game-data source; ExileQuesting validates its generated geometry against the pinned PoB interpretation before trusting it for visual guidance. ExileQuesting does not bundle or execute the Path of Building application.

Path of Building Community is distributed under the MIT License:

> Copyright (c) 2016 David Gowor
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## XileHUD

Repository: <https://github.com/XileHUD/poe_overlay>

XileHUD is GPL-3.0-only. It was reviewed to understand established user expectations around PoB import, Client.txt area-ID tracking, overlay modes, passive-tree progression, clipboard item parsing, and release/update UX. No XileHUD source code or data is copied into ExileQuesting.

## Other reviewed projects

The following projects were reviewed as product/UX prior art and are not bundled:

- PoE Leveling Overlay: <https://github.com/Tysktillan/poe-leveling-overlay>
- PoE Leveling Guide: <https://github.com/JusKillmeQik/PoE-Leveling-Guide>
- ExileCompass: <https://github.com/juddisjudd/exilecompass>
- Path of Leveling: <https://github.com/karakasis/Path-of-Leveling>
- PoE LiveSplit Component: <https://github.com/brandondong/POE-LiveSplit-Component>
