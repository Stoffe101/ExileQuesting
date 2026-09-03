-- ExileQuesting headless Path of Building calculation adapter.
--
-- Run this script with cwd set to the pinned PoB `src` directory and LUA_PATH
-- pointing at the pinned PoB `runtime/lua` directory. The worker deliberately
-- accepts only newline-delimited JSON requests from ExileQuesting. PoB console
-- output may share stdout, so protocol responses are prefixed with a sentinel.

local PROTOCOL_VERSION = 1
local ADAPTER_VERSION = "0.1.0"
local POB_REPOSITORY = "PathOfBuildingCommunity/PathOfBuilding"
local POB_COMMIT = "ed354c2f8c42e148bc904c7508dbe851fb2cf952"
local SENTINEL = "@@EXILEQUESTING_POB@@"

dofile("HeadlessWrapper.lua")

local json = require("dkjson")

local function finiteNumber(value)
    if type(value) ~= "number" then
        return nil
    end
    if value ~= value or value == math.huge or value == -math.huge then
        return nil
    end
    return value
end

local function numberOrNil(output, key)
    if type(output) ~= "table" then
        return nil
    end
    return finiteNumber(output[key])
end

local function emit(value)
    local encoded = json.encode(value)
    io.stdout:write(SENTINEL .. encoded .. "\n")
    io.stdout:flush()
end

local function errorResponse(requestId, code, message, retryable)
    return {
        protocolVersion = PROTOCOL_VERSION,
        requestId = requestId,
        ok = false,
        error = {
            code = code,
            message = message,
            retryable = retryable == true,
        },
    }
end

local function kernelVersion()
    return {
        protocolVersion = PROTOCOL_VERSION,
        pobRepository = POB_REPOSITORY,
        pobCommit = POB_COMMIT,
        runtime = jit and ("LuaJIT " .. tostring(jit.version or "")) or _VERSION,
        adapterVersion = ADAPTER_VERSION,
    }
end

local function safeScenario(request)
    if type(request.scenario) ~= "table" or type(request.scenario.scenario) ~= "string" then
        return { scenario = "imported" }
    end
    return request.scenario
end

local function normalizeOutput(request, startedAt)
    local output = build and build.calcsTab and build.calcsTab.mainOutput
    if type(output) ~= "table" then
        return nil, "PoB did not expose build.calcsTab.mainOutput after loading the build."
    end

    local fullDps = numberOrNil(output, "FullDPS")
    local combinedDps = numberOrNil(output, "CombinedDPS")
    local hitDps = numberOrNil(output, "TotalDPS")
    local dotDps = numberOrNil(output, "TotalDotDPS")
    local totalDps = fullDps
    if not totalDps or totalDps <= 0 then
        totalDps = combinedDps or hitDps or dotDps
    end

    local warnings = {}
    if output.GuardSkillActive then
        table.insert(warnings, {
            code = "guard-skill-active",
            message = "PoB maximum-hit/EHP outputs include an active guard skill in this imported configuration.",
            confidence = "verified",
        })
    end

    return {
        protocolVersion = PROTOCOL_VERSION,
        requestId = request.requestId,
        kernel = kernelVersion(),
        scenario = safeScenario(request),
        offence = {
            totalDps = totalDps,
            fullDps = fullDps,
            combinedDps = combinedDps,
            hitDps = hitDps,
            dotDps = dotDps,
            igniteDps = numberOrNil(output, "IgniteDPS"),
            bleedDps = numberOrNil(output, "BleedDPS"),
            poisonDps = numberOrNil(output, "PoisonDPS"),
            impaleDps = numberOrNil(output, "ImpaleDPS"),
            averageHit = numberOrNil(output, "AverageHit") or numberOrNil(output, "AverageDamage"),
            speed = numberOrNil(output, "Speed"),
            hitRate = numberOrNil(output, "HitSpeed"),
            effectiveTriggerRate = (numberOrNil(output, "TriggerTime") or 0) ~= 0 and numberOrNil(output, "Speed") or nil,
            hitChance = numberOrNil(output, "HitChance"),
            critChance = numberOrNil(output, "CritChance"),
            critMultiplier = numberOrNil(output, "CritMultiplier"),
        },
        defence = {
            life = numberOrNil(output, "Life"),
            energyShield = numberOrNil(output, "EnergyShield"),
            mana = numberOrNil(output, "Mana"),
            ward = numberOrNil(output, "Ward"),
            effectiveHitPool = numberOrNil(output, "TotalEHP"),
            maximumHit = {
                physical = numberOrNil(output, "PhysicalMaximumHitTaken"),
                fire = numberOrNil(output, "FireMaximumHitTaken"),
                cold = numberOrNil(output, "ColdMaximumHitTaken"),
                lightning = numberOrNil(output, "LightningMaximumHitTaken"),
                chaos = numberOrNil(output, "ChaosMaximumHitTaken"),
            },
            armour = numberOrNil(output, "Armour"),
            evasion = numberOrNil(output, "Evasion"),
            spellSuppressionChance = numberOrNil(output, "EffectiveSpellSuppressionChance"),
            attackBlockChance = numberOrNil(output, "EffectiveBlockChance"),
            spellBlockChance = numberOrNil(output, "EffectiveSpellBlockChance"),
            fireResistance = numberOrNil(output, "FireResist"),
            coldResistance = numberOrNil(output, "ColdResist"),
            lightningResistance = numberOrNil(output, "LightningResist"),
            chaosResistance = numberOrNil(output, "ChaosResist"),
            fireResistanceOverCap = numberOrNil(output, "FireResistOverCap"),
            coldResistanceOverCap = numberOrNil(output, "ColdResistOverCap"),
            lightningResistanceOverCap = numberOrNil(output, "LightningResistOverCap"),
            chaosResistanceOverCap = numberOrNil(output, "ChaosResistOverCap"),
            lifeRegen = numberOrNil(output, "LifeRegenRecovery"),
            energyShieldRegen = numberOrNil(output, "EnergyShieldRegenRecovery"),
            lifeLeechRate = numberOrNil(output, "LifeLeechGainRate"),
            energyShieldLeechRate = numberOrNil(output, "EnergyShieldLeechGainRate"),
            totalNetRecovery = numberOrNil(output, "TotalNetRegen"),
            netLifeRecovery = numberOrNil(output, "NetLifeRegen"),
            netManaRecovery = numberOrNil(output, "NetManaRegen"),
            netEnergyShieldRecovery = numberOrNil(output, "NetEnergyShieldRegen"),
            totalDegen = numberOrNil(output, "TotalBuildDegen"),
            guardSkillActive = output.GuardSkillActive == true,
        },
        warnings = warnings,
        elapsedMs = math.max(0, (os.clock() - startedAt) * 1000),
    }
end

local function validRequest(request)
    if type(request) ~= "table" then
        return false, "invalid-request", "Request must decode to an object."
    end
    if request.protocolVersion ~= PROTOCOL_VERSION then
        return false, "protocol-version", "Unsupported PoB calculation protocol version."
    end
    if type(request.requestId) ~= "string" or request.requestId == "" or #request.requestId > 128 then
        return false, "request-id", "requestId must be a non-empty string no longer than 128 bytes."
    end
    if request.operation ~= "health" and request.operation ~= "load-and-calculate" and request.operation ~= "calculate-with-perturbations" then
        return false, "operation", "Unsupported PoB worker operation."
    end
    return true
end

local function handle(request)
    local valid, code, message = validRequest(request)
    if not valid then
        return errorResponse(request and request.requestId or nil, code, message, false)
    end

    if request.operation == "health" then
        return {
            protocolVersion = PROTOCOL_VERSION,
            requestId = request.requestId,
            ok = true,
            health = {
                status = "ready",
                kernel = kernelVersion(),
            },
        }
    end

    if request.operation == "calculate-with-perturbations" then
        return errorResponse(request.requestId, "perturbations-not-enabled", "Perturbation operations remain disabled until base PoB parity is proven.", false)
    end

    if type(request.xml) ~= "string" or request.xml == "" or #request.xml > 16 * 1024 * 1024 then
        return errorResponse(request.requestId, "xml-bounds", "PoB XML must be non-empty and no larger than 16 MiB.", false)
    end

    local startedAt = os.clock()
    local ok, err = pcall(loadBuildFromXML, request.xml, "ExileQuesting worker")
    if not ok then
        return errorResponse(request.requestId, "pob-load-failed", tostring(err), false)
    end

    local result, normalizeError = normalizeOutput(request, startedAt)
    if not result then
        return errorResponse(request.requestId, "pob-output-missing", normalizeError, true)
    end

    return {
        protocolVersion = PROTOCOL_VERSION,
        requestId = request.requestId,
        ok = true,
        result = result,
    }
end

for line in io.lines() do
    if #line > 20 * 1024 * 1024 then
        emit(errorResponse(nil, "request-too-large", "Encoded worker request exceeds the 20 MiB transport bound.", false))
    elseif line ~= "" then
        local request, _, decodeError = json.decode(line, 1, nil)
        if not request then
            emit(errorResponse(nil, "invalid-json", tostring(decodeError or "Could not decode request JSON."), false))
        else
            local ok, response = pcall(handle, request)
            if not ok then
                emit(errorResponse(request.requestId, "worker-exception", tostring(response), true))
            else
                emit(response)
            end
        end
    end
end
