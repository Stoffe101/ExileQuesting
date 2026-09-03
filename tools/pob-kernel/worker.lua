-- ExileQuesting headless Path of Building calculation adapter.
--
-- Run this script with cwd set to the pinned PoB `src` directory and LUA_PATH
-- pointing at the pinned PoB source/runtime directories. The worker deliberately
-- accepts only newline-delimited JSON requests from ExileQuesting. PoB console
-- output may share stdout, so protocol responses are prefixed with a sentinel.

local PROTOCOL_VERSION = 1
local ADAPTER_VERSION = "0.3.0"
local POB_REPOSITORY = "PathOfBuildingCommunity/PathOfBuilding"
local POB_COMMIT = "ed354c2f8c42e148bc904c7508dbe851fb2cf952"
local RUNTIME_REVISION = os.getenv("EXILEQUESTING_LUAJIT_COMMIT") or "unverified-runtime"
local SENTINEL = "@@EXILEQUESTING_POB@@"
local MAX_ITEM_TEXT_BYTES = 128 * 1024
local MAX_PASSIVE_NODE_ID = 2147483647

local REPLACEABLE_ITEM_SLOTS = {
    ["Weapon 1"] = true,
    ["Weapon 2"] = true,
    ["Helmet"] = true,
    ["Body Armour"] = true,
    ["Gloves"] = true,
    ["Boots"] = true,
    ["Amulet"] = true,
    ["Ring 1"] = true,
    ["Ring 2"] = true,
    ["Ring 3"] = true,
    ["Belt"] = true,
}

local UNSUPPORTED_PASSIVE_NODE_TYPES = {
    ["ClassStart"] = true,
    ["AscendClassStart"] = true,
    ["Mastery"] = true,
    ["Socket"] = true,
}

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
        runtime = jit and tostring(jit.version or "LuaJIT") or _VERSION,
        runtimeRevision = RUNTIME_REVISION,
        adapterVersion = ADAPTER_VERSION,
    }
end

local function safeScenario(request)
    if type(request.scenario) ~= "table" or type(request.scenario.scenario) ~= "string" then
        return { scenario = "imported" }
    end
    return request.scenario
end

local function normalizeOutput(request, startedAt, output)
    output = output or (build and build.calcsTab and build.calcsTab.mainOutput)
    if type(output) ~= "table" then
        return nil, "PoB did not expose a calculation output table."
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
            message = "PoB maximum-hit/EHP outputs include an active guard skill in this calculation state.",
            confidence = "verified",
        })
    end
    if RUNTIME_REVISION == "unverified-runtime" then
        table.insert(warnings, {
            code = "unverified-runtime",
            message = "The LuaJIT runtime revision was not supplied, so this calculation cannot claim fully reproducible kernel provenance.",
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

local function loadRequestBuild(request)
    if type(request.xml) ~= "string" or request.xml == "" or #request.xml > 16 * 1024 * 1024 then
        return false, errorResponse(request.requestId, "xml-bounds", "PoB XML must be non-empty and no larger than 16 MiB.", false)
    end

    local ok, err = pcall(loadBuildFromXML, request.xml, "ExileQuesting worker")
    if not ok then
        return false, errorResponse(request.requestId, "pob-load-failed", tostring(err), false)
    end
    return true
end

local function evaluateItemReplacement(request, startedAt, perturbation)
    if type(perturbation.slot) ~= "string" or not REPLACEABLE_ITEM_SLOTS[perturbation.slot] then
        return errorResponse(request.requestId, "item-slot-unsupported", "The requested PoB item slot is not enabled for replacement sensitivity.", false)
    end
    if type(perturbation.itemText) ~= "string" or perturbation.itemText == "" or #perturbation.itemText > MAX_ITEM_TEXT_BYTES then
        return errorResponse(request.requestId, "item-text-bounds", "Replacement item text must be non-empty and no larger than 128 KiB.", false)
    end

    if not build or not build.itemsTab or not build.itemsTab.slots or not build.itemsTab.slots[perturbation.slot] then
        return errorResponse(request.requestId, "item-slot-missing", "The loaded build does not expose the requested equipment slot.", false)
    end

    local itemOk, replacementItem = pcall(function()
        return new("Item"):Item(perturbation.itemText)
    end)
    if not itemOk then
        return errorResponse(request.requestId, "item-parse-failed", tostring(replacementItem), false)
    end
    if type(replacementItem) ~= "table" or not replacementItem.base then
        return errorResponse(request.requestId, "item-parse-failed", "PoB could not resolve a base type from the replacement item text.", false)
    end

    local compatibilityOk, compatible = pcall(function()
        return build.itemsTab:IsItemValidForSlot(replacementItem, perturbation.slot)
    end)
    if not compatibilityOk then
        return errorResponse(request.requestId, "item-slot-validation-failed", tostring(compatible), true)
    end
    if not compatible then
        return errorResponse(request.requestId, "item-slot-incompatible", "The replacement item is not valid for the requested PoB slot in the current build state.", false)
    end

    local calcFunc, baseOutput = build.calcsTab:GetMiscCalculator()
    if type(calcFunc) ~= "function" or type(baseOutput) ~= "table" then
        return errorResponse(request.requestId, "misc-calculator-missing", "PoB did not expose its reversible miscellaneous calculator after loading the build.", true)
    end

    local calcOk, replacementOutput = pcall(calcFunc, {
        repSlotName = perturbation.slot,
        repItem = replacementItem,
    })
    if not calcOk then
        return errorResponse(request.requestId, "item-replacement-calc-failed", tostring(replacementOutput), true)
    end

    local before, beforeError = normalizeOutput(request, startedAt, baseOutput)
    if not before then
        return errorResponse(request.requestId, "pob-output-missing", beforeError, true)
    end
    local after, afterError = normalizeOutput(request, startedAt, replacementOutput)
    if not after then
        return errorResponse(request.requestId, "pob-output-missing", afterError, true)
    end

    return {
        protocolVersion = PROTOCOL_VERSION,
        requestId = request.requestId,
        ok = true,
        comparison = {
            perturbations = request.perturbations,
            before = before,
            after = after,
        },
    }
end

local function validPassiveNodeId(nodeId)
    return type(nodeId) == "number"
        and nodeId == math.floor(nodeId)
        and nodeId > 0
        and nodeId <= MAX_PASSIVE_NODE_ID
end

local function passiveNodeForId(nodeId)
    if not build or not build.spec or type(build.spec.nodes) ~= "table" then
        return nil
    end
    return build.spec.nodes[nodeId] or build.spec.nodes[tostring(nodeId)]
end

local function passiveNodeSupported(node)
    return type(node) == "table"
        and not UNSUPPORTED_PASSIVE_NODE_TYPES[node.type]
        and node.isProxy ~= true
end

local function evaluatePassiveNode(request, startedAt, perturbation)
    if perturbation.operation ~= "allocate" and perturbation.operation ~= "deallocate" then
        return errorResponse(request.requestId, "passive-operation-unsupported", "Passive-node sensitivity supports only allocate or deallocate operations.", false)
    end
    if not validPassiveNodeId(perturbation.nodeId) then
        return errorResponse(request.requestId, "passive-node-id", "Passive node id must be a positive bounded integer.", false)
    end

    local node = passiveNodeForId(perturbation.nodeId)
    if not node then
        return errorResponse(request.requestId, "passive-node-missing", "The loaded PoB build does not contain the requested passive node id.", false)
    end
    if not passiveNodeSupported(node) then
        return errorResponse(request.requestId, "passive-node-unsupported", "Class starts, mastery selectors, jewel sockets and proxy nodes are excluded from the first passive sensitivity primitive.", false)
    end

    local allocated = node.alloc == true
    if perturbation.operation == "allocate" and allocated then
        return errorResponse(request.requestId, "passive-node-state", "The requested passive node is already allocated in the loaded build.", false)
    end
    if perturbation.operation == "deallocate" and not allocated then
        return errorResponse(request.requestId, "passive-node-state", "The requested passive node is not allocated in the loaded build.", false)
    end

    if not build.calcsTab or type(build.calcsTab.GetMiscCalculator) ~= "function" then
        return errorResponse(request.requestId, "misc-calculator-missing", "PoB did not expose its reversible miscellaneous calculator after loading the build.", true)
    end
    local calcFunc, baseOutput = build.calcsTab:GetMiscCalculator()
    if type(calcFunc) ~= "function" or type(baseOutput) ~= "table" then
        return errorResponse(request.requestId, "misc-calculator-missing", "PoB did not expose its reversible miscellaneous calculator after loading the build.", true)
    end

    local override = {}
    if perturbation.operation == "allocate" then
        override.addNodes = { [node] = true }
    else
        override.removeNodes = { [node] = true }
    end

    local calcOk, passiveOutput = pcall(calcFunc, override)
    if not calcOk then
        return errorResponse(request.requestId, "passive-node-calc-failed", tostring(passiveOutput), true)
    end

    local before, beforeError = normalizeOutput(request, startedAt, baseOutput)
    if not before then
        return errorResponse(request.requestId, "pob-output-missing", beforeError, true)
    end
    local after, afterError = normalizeOutput(request, startedAt, passiveOutput)
    if not after then
        return errorResponse(request.requestId, "pob-output-missing", afterError, true)
    end

    return {
        protocolVersion = PROTOCOL_VERSION,
        requestId = request.requestId,
        ok = true,
        comparison = {
            perturbations = request.perturbations,
            before = before,
            after = after,
        },
    }
end

local function evaluatePerturbation(request, startedAt)
    if type(request.perturbations) ~= "table" or #request.perturbations ~= 1 then
        return errorResponse(request.requestId, "perturbation-batch-unsupported", "The sensitivity adapter accepts exactly one perturbation per calculation.", false)
    end

    local perturbation = request.perturbations[1]
    if type(perturbation) ~= "table" or type(perturbation.kind) ~= "string" then
        return errorResponse(request.requestId, "perturbation-kind-unsupported", "The perturbation must be a supported structured operation.", false)
    end
    if perturbation.kind == "replace-item" then
        return evaluateItemReplacement(request, startedAt, perturbation)
    end
    if perturbation.kind == "passive-node" then
        return evaluatePassiveNode(request, startedAt, perturbation)
    end
    return errorResponse(request.requestId, "perturbation-kind-unsupported", "Only replace-item and passive-node perturbations are currently enabled.", false)
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

    local startedAt = os.clock()
    local loaded, loadErrorResponse = loadRequestBuild(request)
    if not loaded then
        return loadErrorResponse
    end

    if request.operation == "calculate-with-perturbations" then
        return evaluatePerturbation(request, startedAt)
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
