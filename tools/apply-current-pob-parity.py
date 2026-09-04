from pathlib import Path
import re

FILES = [
    'tools/pob-kernel-parity.ts',
    'tools/pob-constraint-parity.ts',
    'tools/pob-flask-parity.ts',
    'tools/pob-flask-uptime-probe.ts',
    'tools/pob-flask-uptime-parity.ts',
]

IMPORT = "import { materializeCurrentParityFixture, POB_PARITY_FIXTURES } from './pob-kernel/current-parity-fixture';\n"
FIXTURE_BLOCK = re.compile(
    r"const FIXTURES = \[\n"
    r"  'spec/TestBuilds/3\.13/OccVortex\.xml',\n"
    r"  'spec/TestBuilds/3\.13/Dual Wield Cospris CoC\.xml',\n"
    r"  'spec/TestBuilds/3\.13/Mirage Archer Toxic Rain\.xml',\n"
    r"\] as const;"
)

for name in FILES:
    path = Path(name)
    text = path.read_text(encoding='utf-8')
    if IMPORT.strip() not in text:
        anchor = "import { resolve } from 'node:path';\n"
        if anchor not in text:
            raise SystemExit(f'{name}: node:path import anchor missing')
        text = text.replace(anchor, anchor + IMPORT, 1)
    text, count = FIXTURE_BLOCK.subn('const FIXTURES = POB_PARITY_FIXTURES;', text, count=1)
    if count != 1:
        raise SystemExit(f'{name}: fixture block replacement count={count}')
    path.write_text(text, encoding='utf-8')


def replace(path_name: str, old: str, new: str) -> None:
    path = Path(path_name)
    text = path.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'{path_name}: missing anchor {old[:100]!r}')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')

# Keep parity provenance assertions aligned with the shipping worker adapters.
replace('tools/pob-kernel-parity.ts', "const ADAPTER_VERSION = '0.6.0';", "const ADAPTER_VERSION = '0.7.0';")
replace('tools/pob-flask-parity.ts', "const ADAPTER_VERSION = '0.6.0';", "const ADAPTER_VERSION = '0.7.0';")
replace('tools/pob-flask-uptime-parity.ts', "const EXPECTED_ADAPTER_VERSION = '0.6.0';", "const EXPECTED_ADAPTER_VERSION = '0.7.0';")
replace('tools/pob-constraint-parity.ts', "const CONSTRAINT_ADAPTER_VERSION = 'constraint-0.1.0';", "const CONSTRAINT_ADAPTER_VERSION = 'constraint-0.2.0';")

# The materialized current-tree XML must be identical for the raw reference and worker sides.
replace(
    'tools/pob-kernel-parity.ts',
    "  const xml = await readFile(resolve(pobRoot, fixture), 'utf8');\n  const reference = await runReference(pobRoot, runtimePath, referenceScriptPath, fixture);",
    "  const currentFixture = await materializeCurrentParityFixture(pobRoot, fixture);\n  const xml = currentFixture.xml;\n  const reference = await runReference(pobRoot, runtimePath, referenceScriptPath, currentFixture.relativePath);",
)
replace(
    'tools/pob-constraint-parity.ts',
    "    const reference = await runReference(pobRoot, runtimePath, referenceScriptPath, fixture);\n    if (!validSlot(reference.slot)) throw new Error(`${fixture}: reference selected unsupported slot ${reference.slot}.`);\n    const xml = await readFile(resolve(pobRoot, fixture), 'utf8');",
    "    const currentFixture = await materializeCurrentParityFixture(pobRoot, fixture);\n    const reference = await runReference(pobRoot, runtimePath, referenceScriptPath, currentFixture.relativePath);\n    if (!validSlot(reference.slot)) throw new Error(`${fixture}: reference selected unsupported slot ${reference.slot}.`);\n    const xml = currentFixture.xml;",
)
replace(
    'tools/pob-flask-parity.ts',
    "  const reference = await runReference(pobRoot, runtimePath, referenceScriptPath, fixture);\n  const xml = await readFile(resolve(pobRoot, fixture), 'utf8');",
    "  const currentFixture = await materializeCurrentParityFixture(pobRoot, fixture);\n  const reference = await runReference(pobRoot, runtimePath, referenceScriptPath, currentFixture.relativePath);\n  const xml = currentFixture.xml;",
)
replace(
    'tools/pob-flask-uptime-probe.ts',
    "    const payload = await runReference(pobRoot, runtimePath, referenceScriptPath, fixture);",
    "    const currentFixture = await materializeCurrentParityFixture(pobRoot, fixture);\n    const payload = await runReference(pobRoot, runtimePath, referenceScriptPath, currentFixture.relativePath);",
)
replace(
    'tools/pob-flask-uptime-parity.ts',
    "    const fixturePath = resolve(pobRoot, fixture);\n    const xml = await readFile(fixturePath, 'utf8');\n    const reference = await runReference(pobRoot, runtimePath, referenceScriptPath, fixturePath);",
    "    const currentFixture = await materializeCurrentParityFixture(pobRoot, fixture);\n    const xml = currentFixture.xml;\n    const reference = await runReference(pobRoot, runtimePath, referenceScriptPath, currentFixture.absolutePath);",
)

# Remove imports that became stale after XML loading moved into the shared fixture helper.
for name in ['tools/pob-kernel-parity.ts', 'tools/pob-constraint-parity.ts', 'tools/pob-flask-parity.ts', 'tools/pob-flask-uptime-parity.ts']:
    path = Path(name)
    text = path.read_text(encoding='utf-8')
    text = text.replace("import { mkdir, readFile, writeFile } from 'node:fs/promises';", "import { mkdir, writeFile } from 'node:fs/promises';", 1)
    path.write_text(text, encoding='utf-8')

# Clean temporary migration machinery from the resulting branch commit.
for transient in [
    'tools/apply-current-pob-parity.py',
    '.github/workflows/v025-current-pob-parity-migration.yml',
]:
    path = Path(transient)
    if path.exists():
        path.unlink()
