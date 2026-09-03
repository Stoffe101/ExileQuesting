# Third-party notices

ExileQuesting's own code is licensed under PolyForm Noncommercial License 1.0.0. Third-party material listed here remains under its original license or terms and is not relicensed by ExileQuesting.

## Path of Building Community and LuaJIT calculation runtime

Repositories:
- <https://github.com/PathOfBuildingCommunity/PathOfBuilding>
- <https://github.com/LuaJIT/LuaJIT>

ExileQuesting v0.3's Build Doctor calculation kernel runs Path of Building Community as an isolated headless child process. The packaged runtime is pinned to an exact reviewed Path of Building commit and an exact reviewed LuaJIT commit; those source pins and SHA-256 bundle provenance are recorded in the adjacent `pob-kernel/manifest.json` installed with ExileQuesting.

Path of Building and LuaJIT are not linked into or relicensed as ExileQuesting code. They remain separate third-party runtime components. The packaged `pob-kernel/licenses` directory contains the complete Path of Building `LICENSE.md` from the pinned source checkout and LuaJIT `COPYRIGHT` notice from the pinned runtime checkout. Path of Building's license document also preserves notices for the third-party components distributed by its runtime bundle.

ExileQuesting deliberately stages the complete reviewed Path of Building source/runtime bundle for the first Build Doctor alpha instead of silently reconstructing Path of Exile calculation semantics. Numerical Build Doctor results are produced by that pinned calculation process, while ExileQuesting supplies bounded inputs, parity testing, sensitivity analysis, evidence modelling and explanations.

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
