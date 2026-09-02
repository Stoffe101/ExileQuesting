export type PoeGearSlot =
  | 'helmet'
  | 'body-armour'
  | 'gloves'
  | 'boots'
  | 'belt'
  | 'amulet'
  | 'ring'
  | 'weapon'
  | 'offhand'
  | 'quiver'
  | 'flask'
  | 'jewel'
  | 'unknown';

export interface PoeItemRequirements {
  level?: number;
  str?: number;
  dex?: number;
  int?: number;
}

export interface PoeItemStats {
  maximumLife: number;
  maximumMana: number;
  fireResistance: number;
  coldResistance: number;
  lightningResistance: number;
  chaosResistance: number;
  allElementalResistance: number;
  strength: number;
  dexterity: number;
  intelligence: number;
  allAttributes: number;
  movementSpeed: number;
  attackSpeed: number;
  castSpeed: number;
  increasedDamage: number;
  gemLevels: number;
  armour: number;
  evasion: number;
  energyShield: number;
  ward: number;
}

export interface ParsedPoeItem {
  raw: string;
  itemClass?: string;
  rarity?: string;
  name: string;
  baseType: string;
  slot: PoeGearSlot;
  itemLevel?: number;
  requirements: PoeItemRequirements;
  socketText?: string;
  sockets: number;
  maxLinks: number;
  quality?: number;
  corrupted: boolean;
  mirrored: boolean;
  unidentified: boolean;
  stats: PoeItemStats;
  modifierLines: string[];
}

export const MAX_ITEM_TEXT_CHARS = 128 * 1024;

function integer(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value.replace(/,/g, ''));
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
}

function firstInteger(line: string, pattern: RegExp): number {
  return integer(line.match(pattern)?.[1]) ?? 0;
}

function property(lines: string[], label: string): string | undefined {
  const match = lines.find((line) => line.toLowerCase().startsWith(`${label.toLowerCase()}:`));
  return match?.slice(match.indexOf(':') + 1).trim();
}

function numericProperty(lines: string[], label: string): number | undefined {
  const value = property(lines, label)?.match(/-?\d[\d,]*/)?.[0];
  return integer(value);
}

function slotFromClass(itemClass = ''): PoeGearSlot {
  const value = itemClass.toLowerCase();
  if (value.includes('helmet')) return 'helmet';
  if (value.includes('body armour')) return 'body-armour';
  if (value.includes('glove')) return 'gloves';
  if (value.includes('boot')) return 'boots';
  if (value.includes('belt')) return 'belt';
  if (value.includes('amulet')) return 'amulet';
  if (value.includes('ring')) return 'ring';
  if (value.includes('quiver')) return 'quiver';
  if (value.includes('shield') || value.includes('focus')) return 'offhand';
  if (value.includes('flask')) return 'flask';
  if (value.includes('jewel')) return 'jewel';
  if (/bow|wand|staff|staves|sword|axe|mace|claw|dagger|sceptre|warstaff|fishing rod/.test(value)) return 'weapon';
  return 'unknown';
}

export function slotFromPobSlot(slot = ''): PoeGearSlot {
  const value = slot.toLowerCase().replace(/\s+/g, ' ').trim();
  if (value.includes('helmet') || value === 'helm') return 'helmet';
  if (value.includes('body armour') || value.includes('bodyarmour')) return 'body-armour';
  if (value.includes('glove')) return 'gloves';
  if (value.includes('boot')) return 'boots';
  if (value.includes('belt')) return 'belt';
  if (value.includes('amulet')) return 'amulet';
  if (value.includes('ring')) return 'ring';
  if (value.includes('quiver')) return 'quiver';
  if (value.includes('flask')) return 'flask';
  if (value.includes('jewel') || value.includes('socket')) return 'jewel';
  if (value.includes('weapon 2') || value.includes('offhand') || value.includes('shield')) return 'offhand';
  if (value.includes('weapon')) return 'weapon';
  return 'unknown';
}

function identity(lines: string[], rarity: string | undefined): { name: string; baseType: string } {
  const rarityIndex = lines.findIndex((line) => /^Rarity:/i.test(line));
  const start = rarityIndex >= 0 ? rarityIndex + 1 : 0;
  const end = lines.findIndex((line, index) => index >= start && line === '--------');
  const candidates = lines
    .slice(start, end >= 0 ? end : lines.length)
    .filter((line) => line && !/^[A-Za-z ]+:/.test(line));
  if (!candidates.length) return { name: 'Unknown item', baseType: 'Unknown base' };
  if ((rarity ?? '').toLowerCase() === 'normal' || candidates.length === 1) return { name: candidates[0], baseType: candidates[0] };
  return { name: candidates[0], baseType: candidates[1] ?? candidates[0] };
}

function socketInfo(socketText?: string): { sockets: number; maxLinks: number } {
  if (!socketText) return { sockets: 0, maxLinks: 0 };
  const groups = socketText.split(/\s+/).filter(Boolean);
  let sockets = 0;
  let maxLinks = 0;
  for (const group of groups) {
    const entries = group.split('-').filter((entry) => /[RGBWAD]/i.test(entry));
    sockets += entries.length;
    maxLinks = Math.max(maxLinks, entries.length);
  }
  return { sockets, maxLinks };
}

function statsFor(lines: string[]): PoeItemStats {
  const stats: PoeItemStats = {
    maximumLife: 0,
    maximumMana: 0,
    fireResistance: 0,
    coldResistance: 0,
    lightningResistance: 0,
    chaosResistance: 0,
    allElementalResistance: 0,
    strength: 0,
    dexterity: 0,
    intelligence: 0,
    allAttributes: 0,
    movementSpeed: 0,
    attackSpeed: 0,
    castSpeed: 0,
    increasedDamage: 0,
    gemLevels: 0,
    armour: numericProperty(lines, 'Armour') ?? 0,
    evasion: numericProperty(lines, 'Evasion Rating') ?? 0,
    energyShield: numericProperty(lines, 'Energy Shield') ?? 0,
    ward: numericProperty(lines, 'Ward') ?? 0,
  };

  for (const line of lines) {
    stats.maximumLife += firstInteger(line, /\+(\d+) to maximum Life/i);
    stats.maximumMana += firstInteger(line, /\+(\d+) to maximum Mana/i);
    stats.fireResistance += firstInteger(line, /\+(-?\d+)% to Fire Resistance/i);
    stats.coldResistance += firstInteger(line, /\+(-?\d+)% to Cold Resistance/i);
    stats.lightningResistance += firstInteger(line, /\+(-?\d+)% to Lightning Resistance/i);
    stats.chaosResistance += firstInteger(line, /\+(-?\d+)% to Chaos Resistance/i);
    stats.allElementalResistance += firstInteger(line, /\+(-?\d+)% to all Elemental Resistances/i);
    stats.strength += firstInteger(line, /\+(\d+) to Strength/i);
    stats.dexterity += firstInteger(line, /\+(\d+) to Dexterity/i);
    stats.intelligence += firstInteger(line, /\+(\d+) to Intelligence/i);
    stats.allAttributes += firstInteger(line, /\+(\d+) to all Attributes/i);
    stats.movementSpeed = Math.max(stats.movementSpeed, firstInteger(line, /(\d+)% increased Movement Speed/i));
    stats.attackSpeed += firstInteger(line, /(\d+)% increased Attack Speed/i);
    stats.castSpeed += firstInteger(line, /(\d+)% increased Cast Speed/i);
    stats.increasedDamage += firstInteger(line, /(\d+)% increased (?:[^\n]* )?Damage/i);
    if (/\+\d+ to Level of/i.test(line) && /Skill Gems?/i.test(line)) stats.gemLevels += firstInteger(line, /\+(\d+) to Level/i);
  }
  return stats;
}

function modifierLines(lines: string[]): string[] {
  const excluded = /^(Item Class|Rarity|Quality|Armour|Evasion Rating|Energy Shield|Ward|Item Level|Sockets|Level|Str|Dex|Int|Physical Damage|Elemental Damage|Critical Strike Chance|Attacks per Second|Weapon Range):/i;
  const identityMarkers = new Set(['--------', 'Requirements:', 'Implicits:']);
  return lines.filter((line) => {
    if (!line || identityMarkers.has(line) || excluded.test(line)) return false;
    if (/^(Corrupted|Mirrored|Unidentified)$/i.test(line)) return false;
    if (/^(Rare|Unique|Magic|Normal)$/i.test(line)) return false;
    if (/^[A-Za-z ]+:$/.test(line)) return false;
    return /(?:\+|-?\d+%|increased|reduced|adds |gain |level of|resistance|maximum life|maximum mana)/i.test(line);
  }).slice(0, 80);
}

export function parsePoeItemText(input: string): ParsedPoeItem {
  const raw = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (!raw) throw new Error('Item text is empty. Copy an item in Path of Exile with Ctrl+C, then paste it here.');
  if (raw.length > MAX_ITEM_TEXT_CHARS) throw new Error('Item text exceeds the safety size limit.');
  const lines = raw.split('\n').map((line) => line.trim());
  const itemClass = property(lines, 'Item Class');
  const rarity = property(lines, 'Rarity');
  const itemIdentity = identity(lines, rarity);
  const socketText = property(lines, 'Sockets');
  const socket = socketInfo(socketText);
  const requirements: PoeItemRequirements = {};
  const requirementsIndex = lines.findIndex((line) => line === 'Requirements:');
  if (requirementsIndex >= 0) {
    const tail = lines.slice(requirementsIndex + 1, requirementsIndex + 8);
    requirements.level = numericProperty(tail, 'Level');
    requirements.str = numericProperty(tail, 'Str');
    requirements.dex = numericProperty(tail, 'Dex');
    requirements.int = numericProperty(tail, 'Int');
  }
  const quality = property(lines, 'Quality')?.match(/(\d+)%/)?.[1];

  return {
    raw,
    itemClass,
    rarity,
    name: itemIdentity.name,
    baseType: itemIdentity.baseType,
    slot: slotFromClass(itemClass),
    itemLevel: numericProperty(lines, 'Item Level'),
    requirements,
    socketText,
    sockets: socket.sockets,
    maxLinks: socket.maxLinks,
    quality: integer(quality),
    corrupted: lines.some((line) => /^Corrupted$/i.test(line)),
    mirrored: lines.some((line) => /^Mirrored$/i.test(line)),
    unidentified: lines.some((line) => /^Unidentified$/i.test(line)),
    stats: statsFor(lines),
    modifierLines: modifierLines(lines),
  };
}

export function elementalResistanceTotal(item: ParsedPoeItem): number {
  const direct = item.stats.fireResistance + item.stats.coldResistance + item.stats.lightningResistance;
  return direct + item.stats.allElementalResistance * 3;
}
