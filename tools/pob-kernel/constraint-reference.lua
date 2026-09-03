-- Independent Path of Building reference runner for ExileQuesting constraint parity.
--
-- It intentionally does not share the constraint worker protocol or selection
-- helpers. The reference loads one fixture, discovers a replaceable equipped
-- item, calculates a blank same-base replacement directly through PoB, and emits
-- a bounded raw constraint subset for independent comparison.

local SENTINEL = "@@EXILEQUESTING_POB_CONSTRAINT_REFERENCE@@"
local fixturePath = arg[1]
if type(fixturePath) ~= "string" or fixturePath == "" then
    io.stderr:write("constraint-reference.lua requires a fixture XML path as argv[1].\n")
    os.exit(2)
end

dofile("HeadlessWrapper.lua")
local json = require("dkjson")

local file, openError = io.open(fixturePath, "rb")
if not file then
    io.stderr:write("Could not open PoB fixture: " .. tostring(openError) .. "\n")
    os.exit(3)
end
local xml = file:read("*a")
file:close()

local ok, loadError = pcall(loadBuildFromXML, xml, fixturePath)
if not ok then
    io.stderr:write("PoB constraint reference load failed: " .. tostring(loadError) .. "\n")
    os.exit(4)
end

local function scalar(source, key)
    local value = source and source[key]
    if type(value) == "number" and value == value and value ~= math.huge and value ~= -math.huge then
        return value
    end
    return nil
end

local function rawSnapshot(output)
    return {
        Str = scalar(output, "Str"), ReqStr = scalar(output, "ReqStr"),
        Dex = scalar(output, "Dex"), ReqDex = scalar(output, "ReqDex"),
        Int = scalar(output, "Int"), ReqInt = scalar(output, "ReqInt"),
        ManaUnreserved = scalar(output, "ManaUnreserved"),
        ManaUnreservedPercent = scalar(output, "ManaUnreservedPercent"),
        LifeUnreserved = scalar(output, "LifeUnreserved"),
        LifeUnreservedPercent = scalar(output, "LifeUnreservedPercent"),
        SpellSuppressionChance = scalar(output, "SpellSuppressionChance"),
        EffectiveSpellSuppressionChance = scalar(output, "EffectiveSpellSuppressionChance"),
        SpellSuppressionChanceOverCap = scalar(output, "SpellSuppressionChanceOverCap"),
        SuppressionChanceCap = data and data.misc and scalar(data.misc, "SuppressionChanceCap") or nil,
        FireResist = scalar(output, "FireResist"), FireResistTotal = scalar(output, "FireResistTotal"), FireResistOverCap = scalar(output, "FireResistOverCap"), MissingFireResist = scalar(output, "MissingFireResist"),
        ColdResist = scalar(output, "ColdResist"), ColdResistTotal = scalar(output, "ColdResistTotal"), ColdResistOverCap = scalar(output, "ColdResistOverCap"), MissingColdResist = scalar(output, "MissingColdResist"),
        LightningResist = scalar(output, "LightningResist"), LightningResistTotal = scalar(output, "LightningResistTotal"), LightningResistOverCap = scalar(output, "LightningResistOverCap"), MissingLightningResist = scalar(output, "MissingLightningResist"),
        ChaosResist = scalar(output, "ChaosResist"), ChaosResistTotal = scalar(output, "ChaosResistTotal"), ChaosResistOverCap = scalar(output, "ChaosResistOverCap"), MissingChaosResist = scalar(output, "MissingChaosResist"),
    }
end

local function currentItem(slotName)
    if not build or not build.itemsTab or not build.itemsTab.slots or not build.itemsTab.items then return nil end
    local slot = build.itemsTab.slots[slotName]
    if type(slot) ~= "table" or not slot.selItemId or slot.selItemId == 0 then return nil end
    local item = build.itemsTab.items[slot.selItemId]
    if type(item) ~= "table" or type(item.baseName) ~= "string" or item.baseName == "" then return nil end
    return item
end

local preferredSlots = { "Helmet", "Body Armour", "Gloves", "Boots", "Amulet", "Ring 1", "Ring 2", "Belt", "Weapon 1", "Weapon 2" }
local selectedSlot, itemText, replacementItem
for _, slotName in ipairs(preferredSlots) do
    local equipped = currentItem(slotName)
    if equipped then
        local candidateText = "Rarity: RARE\nExileQuesting Constraint Parity Blank\n" .. equipped.baseName
        local candidate = new("Item"):Item(candidateText)
        if candidate and candidate.base and build.itemsTab:IsItemValidForSlot(candidate, slotName) then
            selectedSlot, itemText, replacementItem = slotName, candidateText, candidate
            break
        end
    end
end
if not selectedSlot then
    io.stderr:write("PoB constraint reference could not find a replaceable equipped item.\n")
    os.exit(5)
end

local calcFunc, baseOutput = build.calcsTab:GetMiscCalculator()
if type(calcFunc) ~= "function" or type(baseOutput) ~= "table" then
    io.stderr:write("PoB constraint reference did not expose its miscellaneous calculator.\n")
    os.exit(6)
end
local calcOk, replacementOutput = pcall(calcFunc, { repSlotName = selectedSlot, repItem = replacementItem })
if not calcOk or type(replacementOutput) ~= "table" then
    io.stderr:write("PoB constraint reference item replacement failed: " .. tostring(replacementOutput) .. "\n")
    os.exit(7)
end

io.stdout:write(SENTINEL .. json.encode({
    slot = selectedSlot,
    itemText = itemText,
    before = rawSnapshot(baseOutput),
    after = rawSnapshot(replacementOutput),
}) .. "\n")
io.stdout:flush()
