-- Independent Path of Building flask reference runner.
--
-- This does not use ExileQuesting's worker protocol or normalization. It loads
-- one upstream PoB fixture, records raw processed flask-profile inputs directly
-- from PoB, and independently finds a measurable active-state toggle when one
-- exists.

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

if not build or not build.itemsTab or not build.calcsTab or type(build.calcsTab.mainEnv) ~= "table" then
    io.stderr:write("PoB flask reference did not expose item/calculation state.\n")
    os.exit(5)
end
local modDB = build.calcsTab.mainEnv.modDB
if type(modDB) ~= "table" or type(modDB.Sum) ~= "function" then
    io.stderr:write("PoB flask reference did not expose its calculation modifier database.\n")
    os.exit(6)
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

local function finiteNumber(value)
    if type(value) ~= "number" or value ~= value or value == math.huge or value == -math.huge then
        return nil
    end
    return value
end

local function finiteOrZero(value)
    return finiteNumber(value) or 0
end

local function selectRaw(source)
    local raw = {}
    for _, key in ipairs(keys) do
        local value = finiteNumber(source[key])
        if value ~= nil then
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

local function localProfile(item)
    local flaskData = item and item.flaskData
    if type(flaskData) ~= "table" then
        return nil
    end
    return {
        duration = finiteNumber(flaskData.duration),
        chargesMax = finiteNumber(flaskData.chargesMax),
        chargesUsed = finiteNumber(flaskData.chargesUsed),
        chargeGainModifier = finiteNumber(flaskData.gainMod),
        effectIncrease = finiteNumber(flaskData.effectInc),
    }
end

local emptyFlaskSlots = 0
local profiles = {}
for index = 1, 5 do
    local slotName = "Flask " .. index
    local slot, item = itemForSlot(slotName)
    if type(slot) ~= "table" then
        io.stderr:write("PoB flask reference is missing expected slot " .. slotName .. ".\n")
        os.exit(7)
    end
    if type(item) ~= "table" then
        emptyFlaskSlots = emptyFlaskSlots + 1
    else
        if type(item.base) ~= "table" or not item.base.flask then
            io.stderr:write("PoB flask reference found a non-flask item in " .. slotName .. ".\n")
            os.exit(8)
        end
        local flaskLocal = localProfile(item)
        if not flaskLocal then
            io.stderr:write("PoB flask reference found no processed flaskData in " .. slotName .. ".\n")
            os.exit(9)
        end
        local life = item.base.flask.life == true
        local mana = item.base.flask.mana == true
        local slotActive = slot.active == true
        if type(build.calcsTab.mainEnv.flasks) == "table" and (build.calcsTab.mainEnv.flasks[item] == true) ~= slotActive then
            io.stderr:write("PoB flask reference active-state mismatch in " .. slotName .. ".\n")
            os.exit(10)
        end
        table.insert(profiles, {
            slot = slotName,
            name = tostring(item.title or item.name or item.baseName or slotName),
            baseName = tostring(item.baseName or "Unknown Flask"),
            rarity = tostring(item.rarity or "UNKNOWN"),
            active = slotActive,
            life = life,
            mana = mana,
            utility = not life and not mana,
            local = flaskLocal,
            buildModifiers = {
                durationIncrease = finiteOrZero(modDB:Sum("INC", nil, "FlaskDuration")),
                chargesUsedIncrease = finiteOrZero(modDB:Sum("INC", nil, "FlaskChargesUsed")),
                chargesGainedIncrease = finiteOrZero(modDB:Sum("INC", nil, "FlaskChargesGained")),
                effectIncrease = finiteOrZero(modDB:Sum("INC", { actor = "player" }, "FlaskEffect")),
                magicUtilityEffectIncrease = finiteOrZero(modDB:Sum("INC", { actor = "player" }, "MagicUtilityFlaskEffect")),
                genericChargesGeneratedPerSecond = finiteOrZero(modDB:Sum("BASE", nil, "FlaskChargesGenerated")),
                lifeChargesGeneratedPerSecond = finiteOrZero(modDB:Sum("BASE", nil, "LifeFlaskChargesGenerated")),
                manaChargesGeneratedPerSecond = finiteOrZero(modDB:Sum("BASE", nil, "ManaFlaskChargesGenerated")),
                utilityChargesGeneratedPerSecond = finiteOrZero(modDB:Sum("BASE", nil, "UtilityFlaskChargesGenerated")),
                chargesGeneratedPerEmptyFlaskPerSecond = finiteOrZero(modDB:Sum("BASE", nil, "FlaskChargesGeneratedPerEmptyFlask")),
                chanceNotConsumeCharges = math.min(finiteOrZero(modDB:Sum("BASE", nil, "FlaskChanceNotConsumeCharges")), 100),
                ironFlaskChargesGeneratedOnWardBreak = finiteOrZero(modDB:Sum("BASE", nil, "IronFlaskChargesGeneratedOnWardBreak")),
            },
        })
    end
end

local calcFunc, baseOutput = build.calcsTab:GetMiscCalculator()
if type(calcFunc) ~= "function" or type(baseOutput) ~= "table" then
    io.stderr:write("PoB flask reference did not expose its miscellaneous calculator.\n")
    os.exit(11)
end

local selected = nil
for index = 1, 5 do
    local slotName = "Flask " .. index
    local slot, item = itemForSlot(slotName)
    if type(slot) == "table" and type(item) == "table" and type(item.base) == "table" and item.base.flask then
        local fromActive = slot.active == true
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

local payload = {
    available = selected ~= nil,
    profiles = {
        emptyFlaskSlots = emptyFlaskSlots,
        flasks = profiles,
    },
}
if selected then
    payload.toggle = selected
end

io.stdout:write(SENTINEL .. json.encode(payload) .. "\n")
io.stdout:flush()
