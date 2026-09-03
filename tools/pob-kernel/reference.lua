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

local parityChangeKeys = {
    "CombinedDPS",
    "TotalDPS",
    "TotalDotDPS",
    "AverageHit",
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

local function reviewedMetricChanged(before, after)
    for _, key in ipairs(parityChangeKeys) do
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

local function sortedAllocatedNodeIds()
    local ids = {}
    if not build.spec or type(build.spec.allocNodes) ~= "table" then
        return ids
    end
    for nodeId, node in pairs(build.spec.allocNodes) do
        if type(nodeId) == "number" and type(node) == "table" and type(node.modKey) == "string" and node.modKey ~= "" then
            table.insert(ids, nodeId)
        end
    end
    table.sort(ids)
    return ids
end

local function findPassiveDeallocation()
    for _, nodeId in ipairs(sortedAllocatedNodeIds()) do
        local node = build.spec.allocNodes[nodeId]
        local calcOk, passiveOutput = pcall(calcFunc, { removeNodes = { [node] = true } })
        if calcOk and type(passiveOutput) == "table" and reviewedMetricChanged(baseOutput, passiveOutput) then
            return nodeId, passiveOutput
        end
    end
    return nil
end

local function findPassiveAllocation()
    local candidates = {}
    local seen = {}
    for _, allocatedId in ipairs(sortedAllocatedNodeIds()) do
        local allocatedNode = build.spec.allocNodes[allocatedId]
        if type(allocatedNode.linked) == "table" then
            for _, linkedNode in ipairs(allocatedNode.linked) do
                local nodeId = type(linkedNode) == "table" and linkedNode.id or nil
                if type(nodeId) == "number"
                    and not seen[nodeId]
                    and not build.spec.allocNodes[nodeId]
                    and type(linkedNode.modKey) == "string"
                    and linkedNode.modKey ~= "" then
                    seen[nodeId] = true
                    table.insert(candidates, nodeId)
                end
            end
        end
    end
    table.sort(candidates)

    for _, nodeId in ipairs(candidates) do
        local node = (build.spec.nodes and build.spec.nodes[nodeId])
            or (build.spec.tree and build.spec.tree.nodes and build.spec.tree.nodes[nodeId])
        if type(node) == "table" then
            local calcOk, passiveOutput = pcall(calcFunc, { addNodes = { [node] = true } })
            if calcOk and type(passiveOutput) == "table" and reviewedMetricChanged(baseOutput, passiveOutput) then
                return nodeId, passiveOutput
            end
        end
    end
    return nil
end

local deallocateNodeId, deallocateOutput = findPassiveDeallocation()
if not deallocateNodeId then
    io.stderr:write("PoB reference could not find an allocated passive node that changes a reviewed metric.\n")
    os.exit(9)
end

local allocateNodeId, allocateOutput = findPassiveAllocation()
if not allocateNodeId then
    io.stderr:write("PoB reference could not find an adjacent unallocated passive node that changes a reviewed metric.\n")
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
        deallocate = {
            nodeId = deallocateNodeId,
            before = selectRaw(baseOutput),
            after = selectRaw(deallocateOutput),
        },
        allocate = {
            nodeId = allocateNodeId,
            before = selectRaw(baseOutput),
            after = selectRaw(allocateOutput),
        },
    },
}) .. "\n")
io.stdout:flush()
