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

local function materiallyChangesReviewedMetric(before, after)
    for _, key in ipairs(keys) do
        local beforeValue = before[key]
        local afterValue = after[key]
        if type(beforeValue) == "number" and type(afterValue) == "number" then
            local tolerance = math.max(0.05, math.abs(beforeValue) * 0.000001, math.abs(afterValue) * 0.000001)
            if math.abs(afterValue - beforeValue) > tolerance then
                return true
            end
        end
    end
    return false
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

local UNSUPPORTED_PASSIVE_NODE_TYPES = {
    ["ClassStart"] = true,
    ["AscendClassStart"] = true,
    ["Mastery"] = true,
    ["Socket"] = true,
}

local NODE_TYPE_PRIORITY = {
    Keystone = 1,
    Notable = 2,
    Normal = 3,
}

local function passiveNodeSupported(node)
    return type(node) == "table"
        and not UNSUPPORTED_PASSIVE_NODE_TYPES[node.type]
        and node.isProxy ~= true
end

local function passiveCandidates(allocated)
    local candidates = {}
    if not build or not build.spec or type(build.spec.nodes) ~= "table" then
        return candidates
    end
    for nodeId, node in pairs(build.spec.nodes) do
        local numericId = tonumber(nodeId)
        if numericId and numericId > 0 and numericId == math.floor(numericId)
            and passiveNodeSupported(node) and (node.alloc == true) == allocated then
            candidates[#candidates + 1] = {
                nodeId = numericId,
                node = node,
                priority = NODE_TYPE_PRIORITY[node.type] or 4,
            }
        end
    end
    table.sort(candidates, function(a, b)
        if a.priority ~= b.priority then
            return a.priority < b.priority
        end
        return a.nodeId < b.nodeId
    end)
    return candidates
end

local function findPassiveOracle(calcFunc, baseOutput, operation)
    local wantAllocated = operation == "deallocate"
    local candidates = passiveCandidates(wantAllocated)
    local attempts = math.min(#candidates, 24)
    for index = 1, attempts do
        local candidate = candidates[index]
        local override = {}
        if operation == "allocate" then
            override.addNodes = { [candidate.node] = true }
        else
            override.removeNodes = { [candidate.node] = true }
        end
        local calcOk, candidateOutput = pcall(calcFunc, override)
        if calcOk and type(candidateOutput) == "table" and materiallyChangesReviewedMetric(baseOutput, candidateOutput) then
            return {
                nodeId = candidate.nodeId,
                nodeName = type(candidate.node.dn) == "string" and candidate.node.dn or nil,
                before = selectRaw(baseOutput),
                after = selectRaw(candidateOutput),
            }
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

local passiveDeallocate = findPassiveOracle(calcFunc, baseOutput, "deallocate")
if not passiveDeallocate then
    io.stderr:write("PoB reference could not find an allocated ordinary passive node with a reviewed measurable effect.\n")
    os.exit(9)
end

local passiveAllocate = findPassiveOracle(calcFunc, baseOutput, "allocate")
if not passiveAllocate then
    io.stderr:write("PoB reference could not find an unallocated ordinary passive node with a reviewed measurable effect.\n")
    os.exit(10)
end

io.stdout:write(SENTINEL .. json.encode({
    raw = selectRaw(output),
    itemReplacement = {
        slot = replacementSlot,
        itemText = replacementItemText,
        before = selectRaw(baseOutput),
        after = selectRaw(replacementOutput),
    },
    passiveNodes = {
        deallocate = passiveDeallocate,
        allocate = passiveAllocate,
    },
}) .. "\n")
io.stdout:flush()
