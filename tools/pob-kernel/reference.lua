-- Independent Path of Building reference runner for ExileQuesting parity tests.
--
-- This intentionally does not share ExileQuesting's request protocol or
-- normalization code. It loads one PoB XML fixture through upstream
-- HeadlessWrapper.lua and emits a bounded subset of raw calculation values.

local SENTINEL = "@@EXILEQUESTING_POB_REFERENCE@@"

local fixturePath = arg[1]
if type(fixturePath) ~= "string" or fixturePath == "" then
    io.stderr:write("reference.lua requires a fixture XML path as argv[1].\n")
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
    io.stderr:write("PoB reference load failed: " .. tostring(loadError) .. "\n")
    os.exit(4)
end

local output = build and build.calcsTab and build.calcsTab.mainOutput
if type(output) ~= "table" then
    io.stderr:write("PoB reference did not expose build.calcsTab.mainOutput.\n")
    os.exit(5)
end

local keys = {
    "FullDPS",
    "CombinedDPS",
    "TotalDPS",
    "TotalDotDPS",
    "IgniteDPS",
    "BleedDPS",
    "PoisonDPS",
    "ImpaleDPS",
    "AverageHit",
    "AverageDamage",
    "Speed",
    "HitSpeed",
    "HitChance",
    "CritChance",
    "CritMultiplier",
    "Life",
    "EnergyShield",
    "Mana",
    "Ward",
    "TotalEHP",
    "PhysicalMaximumHitTaken",
    "FireMaximumHitTaken",
    "ColdMaximumHitTaken",
    "LightningMaximumHitTaken",
    "ChaosMaximumHitTaken",
    "Armour",
    "Evasion",
    "EffectiveSpellSuppressionChance",
    "EffectiveBlockChance",
    "EffectiveSpellBlockChance",
    "FireResist",
    "ColdResist",
    "LightningResist",
    "ChaosResist",
    "FireResistOverCap",
    "ColdResistOverCap",
    "LightningResistOverCap",
    "ChaosResistOverCap",
    "LifeRegenRecovery",
    "EnergyShieldRegenRecovery",
    "LifeLeechGainRate",
    "EnergyShieldLeechGainRate",
    "TotalNetRegen",
    "NetLifeRegen",
    "NetManaRegen",
    "NetEnergyShieldRegen",
    "TotalBuildDegen",
    "GuardSkillActive",
}

local function selectRaw(source)
    local raw = {}
    for _, key in ipairs(keys) do
        local value = source[key]
        local valueType = type(value)
        if valueType == "number" or valueType == "string" or valueType == "boolean" then
            raw[key] = value
        end
    end
    return raw
end

local function currentItemForSlot(slotName)
    if not build or not build.itemsTab or not build.itemsTab.slots or not build.itemsTab.items then
        return nil
    end
    local slot = build.itemsTab.slots[slotName]
    if type(slot) ~= "table" or not slot.selItemId or slot.selItemId == 0 then
        return nil
    end
    local item = build.itemsTab.items[slot.selItemId]
    if type(item) ~= "table" or type(item.baseName) ~= "string" or item.baseName == "" then
        return nil
    end
    return item
end

local function buildBlankReplacement()
    local preferredSlots = {
        "Helmet",
        "Body Armour",
        "Gloves",
        "Boots",
        "Amulet",
        "Ring 1",
        "Ring 2",
        "Belt",
        "Weapon 1",
        "Weapon 2",
    }

    for _, slotName in ipairs(preferredSlots) do
        local existingItem = currentItemForSlot(slotName)
        if existingItem then
            local itemText = "Rarity: RARE\nExileQuesting Parity Blank\n" .. existingItem.baseName
            local replacementItem = new("Item"):Item(itemText)
            if replacementItem and replacementItem.base and build.itemsTab:IsItemValidForSlot(replacementItem, slotName) then
                return slotName, itemText, replacementItem
            end
        end
    end
    return nil
end

local replacementSlot, replacementItemText, replacementItem = buildBlankReplacement()
if not replacementSlot then
    io.stderr:write("PoB reference could not find a replaceable equipped item in the fixture.\n")
    os.exit(6)
end

local calcFunc, baseOutput = build.calcsTab:GetMiscCalculator()
if type(calcFunc) ~= "function" or type(baseOutput) ~= "table" then
    io.stderr:write("PoB reference did not expose its miscellaneous calculator.\n")
    os.exit(7)
end

local replacementOk, replacementOutput = pcall(calcFunc, {
    repSlotName = replacementSlot,
    repItem = replacementItem,
})
if not replacementOk or type(replacementOutput) ~= "table" then
    io.stderr:write("PoB reference item replacement failed: " .. tostring(replacementOutput) .. "\n")
    os.exit(8)
end

io.stdout:write(SENTINEL .. json.encode({
    raw = selectRaw(output),
    itemReplacement = {
        slot = replacementSlot,
        itemText = replacementItemText,
        before = selectRaw(baseOutput),
        after = selectRaw(replacementOutput),
    },
}) .. "\n")
io.stdout:flush()
