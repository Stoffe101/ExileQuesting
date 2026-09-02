import { readFileSync, writeFileSync } from 'node:fs';

function replaceExact(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Missing ${label}`);
  return text.replace(from, to);
}

function replaceRegex(text, pattern, to, label) {
  if (!pattern.test(text)) throw new Error(`Missing ${label}`);
  return text.replace(pattern, to);
}

const servicePath = 'electron/services/passive-tree-hud.ts';
let service = readFileSync(servicePath, 'utf8');

service = replaceExact(service,
`export interface PassiveTreeHudContext {
  enabled: boolean;
  pathPreview: boolean;
  snapshot?: PassiveTreeSnapshot;
  guide?: PassiveTreeGuidePlan;
}`,
`export interface PassiveTreeHudContext {
  enabled: boolean;
  pathPreview: boolean;
  /** Manager/UI focus suppresses the game HUD completely. */
  appWindowFocused?: boolean;
  /** Current character level from Client.txt when available. */
  characterLevel?: number;
  /** Expected route-earned passive reward count. Only used for conservative early-level gating. */
  expectedQuestPassivePoints?: number;
  snapshot?: PassiveTreeSnapshot;
  guide?: PassiveTreeGuidePlan;
}`,
'PassiveTreeHudContext');

service = replaceExact(service,
`const DEFAULT_CAPTURE_WIDTH = 960;
const DEFAULT_SEARCH_INTERVAL = 850;
const DEFAULT_LOCKED_INTERVAL = 300;`,
`// Vision is intentionally low-frequency. The HUD does not need video-frame cadence.
const DEFAULT_CAPTURE_WIDTH = 720;
const DEFAULT_SEARCH_INTERVAL = 1800;
const DEFAULT_LOCKED_INTERVAL = 700;

function isPathOfExileWindowName(name: string): boolean {
  const value = name.trim();
  return /^Path of Exile(?:\\s|$)/i.test(value) && !/^Path of Exile 2(?:\\s|$)/i.test(value);
}`,
'capture defaults');

service = replaceExact(service,
`  private idleState(context: PassiveTreeHudContext): PassiveTreeHudState | undefined {
    if (!context.enabled) return { ...passiveTreeHudIdle(false), status: 'disabled' };
    const guide = context.guide;`,
`  private idleState(context: PassiveTreeHudContext): PassiveTreeHudState | undefined {
    if (!context.enabled) return { ...passiveTreeHudIdle(false), status: 'disabled' };
    if (context.appWindowFocused) {
      return {
        ...passiveTreeHudIdle(true),
        status: 'searching',
        message: 'Passive Tree HUD is paused while the ExileQuesting manager is focused. Return to Path of Exile to resume.',
      };
    }
    const guide = context.guide;`,
'manager focus gate');

service = replaceExact(service,
`    const fixedTargets = guideTargetIds(guide).filter((nodeId) => passiveHudTarget(context.snapshot, nodeId));
    if (!fixedTargets.length) {`,
`    const fixedTargets = guideTargetIds(guide).filter((nodeId) => passiveHudTarget(context.snapshot, nodeId));
    if (!fixedTargets.length) {`,
'fixed targets anchor');

service = replaceExact(service,
`    if (!fixedTargets.length) {
      return {
        ...passiveTreeHudIdle(true),
        status: 'unsupported-target',
        mode: guide.mode,
        sourceLabel: guide.sourceLabel,
        className: guide.className,
        classStartNodeId: guide.classStartNodeId,
        message: 'The active passive target has no fixed passive-tree geometry. Text guidance remains available.',
      };
    }
    return undefined;`,
`    if (!fixedTargets.length) {
      return {
        ...passiveTreeHudIdle(true),
        status: 'unsupported-target',
        mode: guide.mode,
        sourceLabel: guide.sourceLabel,
        className: guide.className,
        classStartNodeId: guide.classStartNodeId,
        message: 'The active passive target has no fixed passive-tree geometry. Text guidance remains available.',
      };
    }

    // At the very start of a fresh character we can prove when no level-earned
    // passive point exists yet. Once quest-passive rewards enter the run, the
    // exact unspent counter is intentionally treated as unknown rather than
    // guessed from route progress.
    if (guide.mode === 'exact' && guide.target && context.characterLevel !== undefined && (context.expectedQuestPassivePoints ?? 0) === 0) {
      const nodes = indexPassiveNodes(context.snapshot!);
      if (passiveNodeScopeKey(nodes.get(guide.target.nodeId)) === 'base') {
        let spent = 0;
        for (const operation of guide.operations.slice(0, guide.cursor)) {
          if (passiveNodeScopeKey(nodes.get(operation.nodeId)) !== 'base') continue;
          spent += operation.type === 'allocate' ? 1 : -1;
        }
        const earned = Math.max(0, Math.trunc(context.characterLevel) - 1);
        if (earned - spent <= 0) {
          return {
            ...passiveTreeHudIdle(true),
            status: 'searching',
            mode: guide.mode,
            sourceLabel: guide.sourceLabel,
            className: guide.className,
            classStartNodeId: guide.classStartNodeId,
            message: 'No unspent level-earned passive point is expected yet. The HUD will resume after the next point is earned.',
          };
        }
      }
    }
    return undefined;`,
'early passive point gate');

service = replaceRegex(service,
/  private async captureDisplay\(display: Display\): Promise<\{ bitmap: Buffer; capture: \{ width: number; height: number \} \}> \{[\s\S]*?\n  \}\n\n  private async tryDisplay/,
`  private async captureDisplay(display: Display): Promise<{ bitmap: Buffer; capture: { width: number; height: number } }> {
    // First enumerate windows with 0x0 thumbnails. This is the cheap process/UI
    // presence gate and prevents continuous desktop capture while PoE is closed.
    const windows = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 0, height: 0 },
      fetchWindowIcons: false,
    });
    if (!windows.some((candidate) => isPathOfExileWindowName(candidate.name))) {
      throw new Error('POE_NOT_RUNNING');
    }

    const thumbnailSize = captureThumbnailSize(display, this.options.captureWidth);
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize, fetchWindowIcons: false });
    const source = sources.find((candidate) => candidate.display_id && candidate.display_id === String(display.id))
      ?? (screen.getAllDisplays().length === 1 && sources.length === 1 ? sources[0] : undefined);
    if (!source) throw new Error(\`No unambiguous desktop capture source matched display \${display.id}.\`);
    if (source.thumbnail.isEmpty()) throw new Error('Desktop capture returned an empty thumbnail.');
    const capture = source.thumbnail.getSize();
    if (capture.width < 320 || capture.height < 180) throw new Error(\`Desktop capture was unexpectedly small (\${capture.width}x\${capture.height}).\`);
    return { bitmap: source.thumbnail.toBitmap(), capture };
  }

  private async tryDisplay`,
'captureDisplay');

service = replaceExact(service,
`      radii: [3, 4, 5, 6, 8, 10, 12, 15, 18], stride: 4, angularSamples: 12,
      minimumContrast: 14, minimumCoverage: 0.54, maximumCandidates: 150,`,
`      radii: [3, 4, 5, 6, 8, 10, 12, 15], stride: 5, angularSamples: 10,
      minimumContrast: 14, minimumCoverage: 0.54, maximumCandidates: 120,`,
'vision workload');

service = replaceExact(service,
`      } catch (error) {
        bestMessage = \`Display \${display.id} could not be inspected safely: \${String(error)}\`;
        this.options.log?.warn('Passive Tree HUD display probe failed.', { displayId: display.id, error });
      }`,
`      } catch (error) {
        if (String(error).includes('POE_NOT_RUNNING')) {
          this.emit({
            status: 'searching', enabled: true, visible: false,
            mode: context.guide?.mode, sourceLabel: context.guide?.sourceLabel,
            className: context.guide?.className, classStartNodeId: context.guide?.classStartNodeId,
            message: 'Path of Exile is not running. Passive Tree HUD capture is suspended.',
            path: [],
          });
          return;
        }
        bestMessage = \`Display \${display.id} could not be inspected safely: \${String(error)}\`;
        this.options.log?.warn('Passive Tree HUD display probe failed.', { displayId: display.id, error });
      }`,
'PoE not running gate');

service = replaceExact(service,
`export const passiveTreeHudInternals = { captureThumbnailSize, mapCaptureToLocalDisplay };`,
`export const passiveTreeHudInternals = { captureThumbnailSize, mapCaptureToLocalDisplay, isPathOfExileWindowName };`,
'internals export');

writeFileSync(servicePath, service);

const mainPath = 'electron/main.ts';
let main = readFileSync(mainPath, 'utf8');
main = replaceExact(main,
`  return {
    enabled: settings.passiveTreeHudEnabled,
    pathPreview: settings.passiveTreeHudPathPreview,
    snapshot: passiveData.snapshot,
    guide: buildPassiveTreeGuidePlan(activeProfile, activeStageId, passiveCursor, passiveData.snapshot),
  };`,
`  const passiveRewardProgress = rewardProgressFor(dataset, progress).passive;
  return {
    enabled: settings.passiveTreeHudEnabled,
    pathPreview: settings.passiveTreeHudPathPreview,
    appWindowFocused: Boolean(mainWindow?.isFocused()),
    characterLevel,
    expectedQuestPassivePoints: passiveRewardProgress.completed,
    snapshot: passiveData.snapshot,
    guide: buildPassiveTreeGuidePlan(activeProfile, activeStageId, passiveCursor, passiveData.snapshot),
  };`,
'main PassiveTreeHudContext');
writeFileSync(mainPath, main);

for (const file of ['package.json', 'package-lock.json']) {
  let text = readFileSync(file, 'utf8');
  text = text.replaceAll('"version": "0.2.1"', '"version": "0.2.2"');
  writeFileSync(file, text);
}

const releasePath = '.github/workflows/release.yml';
let release = readFileSync(releasePath, 'utf8');
release = replaceExact(release,
`          v0.2.1 adds the Passive Tree HUD:
          - Live, click-through guidance over Path of Exile's own passive tree instead of a separate tree viewer.
          - Exact Maxroll next-passive and refund markers, plus safe unordered PoB stage highlighting.
          - Data-driven support for all seven base classes and their distinct GGG start nodes.
          - Scope-local Ascendancy registration using current GGG 3.29 geometry, including all 37 fixed GGG-published scopes in the bundled snapshot.
          - Pan, zoom, ultrawide, 4K and 100/125/150% DPI-aware placement with off-screen target guidance.
          - Fail-closed registration: weak or ambiguous visual matches hide the HUD instead of drawing a guessed marker.
          - No game input automation, process injection or memory reading.`,
`          v0.2.2 hardens Passive Tree HUD live behavior:
          - HUD capture is suspended completely while Path of Exile is not running.
          - ExileQuesting manager focus suppresses the game HUD so it cannot draw over its own UI.
          - Passive-tree vision cadence and capture resolution are reduced substantially to protect game FPS.
          - The marker remains hidden when the passive tree cannot be confidently registered.
          - Fresh-character level-point gating prevents guidance before the first spendable passive point.
          - Existing all-class, Ascendancy, ultrawide, 4K and DPI-aware guidance remains intact.`,
'release notes');
writeFileSync(releasePath, release);

console.log('Applied Passive Tree HUD v0.2.2 live-play hotfix.');
