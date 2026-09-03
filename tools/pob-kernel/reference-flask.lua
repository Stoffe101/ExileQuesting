-- Independent Path of Building flask-availability reference runner.
--
-- This does not use ExileQuesting's worker protocol or normalization. It loads
-- one upstream PoB fixture, finds an equipped flask whose active-state toggle
-- changes a reviewed raw output, and emits the raw before/after calculation.

local SENTINEL = "@@EXILEQUESTING_POB_FLASK_REFERENCE@@"

local fixturePath = arg[1]
if type(fixturePath) ~= "string" or fixturePath == "" then
    io.stderr:write("reference-flask.lua requires a fixture XML path as argv[1].\n")
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
    io.stderr:write("PoB flask reference load failed: " .. tostring(loadError) .. "\n")
    os.exit(4)
end

if not build or not build.itemsTab or not build.calcsTab then
    io.stderr:write("PoB flask reference did not expose item/calculation tabs.\n")
    os.exit(5)
end

local keys = {
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
        if type(value) == "number" and value == value and value ~= math.huge and value ~= -math.huge then
            raw[key] = value
        end
    end
    return raw
end

local function metricChanged(before, after)
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

local function itemForSlot(slotName)
    local slots = build.itemsTab.slots
    local items = build.itemsTab.items
    if type(slots) ~= "table" or type(items) ~= "table" then
        return nil, nil
    end
    local slot = slots[slotName]
    if type(slot) ~= "table" or not slot.selItemId or slot.selItemId == 0 then
        return slot, nil
    end
    return slot, items[slot.selItemId]
end

local calcFunc, baseOutput = build.calcsTab:GetMiscCalculator()
if type(calcFunc) ~= "function" or type(baseOutput) ~= "table" then
    io.stderr:write("PoB flask reference did not expose its miscellaneous calculator.\n")
    os.exit(6)
end

local selected = nil
for index = 1, 5 do
    local slotName = "Flask " .. index
    local slot, item = itemForSlot(slotName)
    if type(slot) == "table" and type(item) == "table" and type(item.base) == "table" and item.base.flask then
        local fromActive = slot.active == true
        local mainEnv = build.calcsTab.mainEnv
        local stateConsistent = true
        if type(mainEnv) == "table" and type(mainEnv.flasks) == "table" then
            stateConsistent = (mainEnv.flasks[item] == true) == fromActive
        end
        if stateConsistent then
            local calcOk, toggledOutput = pcall(calcFunc, { toggleFlask = item })
            if calcOk and type(toggledOutput) == "table" and metricChanged(baseOutput, toggledOutput) then
                selected = {
                    slot = slotName,
                    fromActive = fromActive,
                    toActive = not fromActive,
                    before = selectRaw(baseOutput),
                    after = selectRaw(toggledOutput),
                }
                break
            end
        end
    end
end

io.stdout:write(SENTINEL .. json.encode(selected and {
    available = true,
    toggle = selected,
} or {
    available = false,
}) .. "\n")
io.stdout:flush()
