-- Independent Path of Building reference runner for ExileQuesting parity tests.
--
-- This intentionally does not share ExileQuesting's request protocol or
-- normalization code. It loads one PoB XML fixture through upstream
-- HeadlessWrapper.lua and emits a bounded subset of raw mainOutput values.

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

local raw = {}
for _, key in ipairs(keys) do
    local value = output[key]
    local valueType = type(value)
    if valueType == "number" or valueType == "string" or valueType == "boolean" then
        raw[key] = value
    end
end

io.stdout:write(SENTINEL .. json.encode({ raw = raw }) .. "\n")
io.stdout:flush()
