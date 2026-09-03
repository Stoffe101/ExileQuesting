-- ExileQuesting narrow Path of Building constraint adapter.
--
-- This worker intentionally does not normalize offence/defence calculations.
-- It loads the exact pinned PoB build, exposes one current-state constraint
-- snapshot or applies one reversible item replacement, and returns only
-- constraint-related raw outputs used by Build Doctor.

local PROTOCOL_VERSION = 1
local ADAPTER_VERSION = "constraint-0.2.0"
local POB_REPOSITORY = "PathOfBuildingCommunity/PathOfBuilding"
local POB_COMMIT = "ed354c2f8c42e148bc904c7508dbe851fb2cf952"
local RUNTIME_REVISION = os.getenv("EXILEQUESTING_LUAJIT_COMMIT") or "unverified-runtime"
local SENTINEL = "@@EXILEQUESTING_POB_CONSTRAINT@@"
local MAX_ITEM_TEXT_BYTES = 128 * 1024

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
    io.stdout:write(SENTINEL .. json.encode(value) .. "\n")
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

local function resistanceConstraint(output, element)
    return {
        current = numberOrNil(output, element .. "Resist"),
        total = numberOrNil(output, element .. "ResistTotal"),
        overCap = numberOrNil(output, element .. "ResistOverCap"),
        missing = numberOrNil(output, "Missing" .. element .. "Resist"),
    }
end

local function constraintSnapshot(output)
    if type(output) ~= "table" then
        return nil
    end
    local suppressionCap = data and data.misc and finiteNumber(data.misc.SuppressionChanceCap) or nil
    return {
        attributes = {
            strength = { current = numberOrNil(output, "Str"), required = numberOrNil(output, "ReqStr") },
            dexterity = { current = numberOrNil(output, "Dex"), required = numberOrNil(output, "ReqDex") },
            intelligence = { current = numberOrNil(output, "Int"), required = numberOrNil(output, "ReqInt") },
        },
        reservation = {
            manaUnreserved = numberOrNil(output, "ManaUnreserved"),
            manaUnreservedPercent = numberOrNil(output, "ManaUnreservedPercent"),
            lifeUnreserved = numberOrNil(output, "LifeUnreserved"),
            lifeUnreservedPercent = numberOrNil(output, "LifeUnreservedPercent"),
        },
        spellSuppression = {
            chance = numberOrNil(output, "SpellSuppressionChance"),
            effectiveChance = numberOrNil(output, "EffectiveSpellSuppressionChance"),
            overCap = numberOrNil(output, "SpellSuppressionChanceOverCap"),
            cap = suppressionCap,
        },
        resistances = {
            fire = resistanceConstraint(output, "Fire"),
            cold = resistanceConstraint(output, "Cold"),
            lightning = resistanceConstraint(output, "Lightning"),
            chaos = resistanceConstraint(output, "Chaos"),
        },
    }
end

local function validRequest(request)
    if type(request) ~= "table" then
        return false, "invalid-request", "Request must decode to an object."
    end
    if request.protocolVersion ~= PROTOCOL_VERSION then
        return false, "protocol-version", "Unsupported PoB constraint protocol version."
    end
    if type(request.requestId) ~= "string" or request.requestId == "" or #request.requestId > 128 then
        return false, "request-id", "requestId must be a non-empty string no longer than 128 bytes."
    end
    if request.operation ~= "health" and request.operation ~= "inspect-build-constraints" and request.operation ~= "compare-item-constraints" then
        return false, "operation", "Unsupported PoB constraint worker operation."
    end
    if request.operation == "health" then
        return true
    end
    if type(request.xml) ~= "string" or request.xml == "" or #request.xml > 16 * 1024 * 1024 then
        return false, "xml-bounds", "PoB XML must be non-empty and no larger than 16 MiB."
    end
    if request.operation == "inspect-build-constraints" then
        return true
    end
    if type(request.slot) ~= "string" or not REPLACEABLE_ITEM_SLOTS[request.slot] then
        return false, "item-slot-unsupported", "The requested PoB item slot is not enabled for constraint comparison."
    end
    if type(request.itemText) ~= "string" or request.itemText == "" or #request.itemText > MAX_ITEM_TEXT_BYTES then
        return false, "item-text-bounds", "Replacement item text must be non-empty and no larger than 128 KiB."
    end
    return true
end

local function loadConstraintBuild(request)
    local loadOk, loadError = pcall(loadBuildFromXML, request.xml, "ExileQuesting constraint worker")
    if not loadOk then
        return nil, errorResponse(request.requestId, "pob-load-failed", tostring(loadError), false)
    end
    if not build or not build.calcsTab or type(build.calcsTab.GetMiscCalculator) ~= "function" then
        return nil, errorResponse(request.requestId, "misc-calculator-missing", "The loaded build does not expose the PoB miscellaneous calculator.", true)
    end
    local calcFunc, baseOutput = build.calcsTab:GetMiscCalculator()
    if type(calcFunc) ~= "function" or type(baseOutput) ~= "table" then
        return nil, errorResponse(request.requestId, "misc-calculator-missing", "PoB did not expose its reversible miscellaneous calculator after loading the build.", true)
    end
    return { calcFunc = calcFunc, baseOutput = baseOutput }, nil
end

local function inspectBuildConstraints(request)
    local loaded, loadError = loadConstraintBuild(request)
    if not loaded then
        return loadError
    end
    local metrics = constraintSnapshot(loaded.baseOutput)
    if not metrics then
        return errorResponse(request.requestId, "constraint-output-missing", "PoB did not expose a current-state constraint output table.", true)
    end
    return {
        protocolVersion = PROTOCOL_VERSION,
        requestId = request.requestId,
        ok = true,
        kernel = kernelVersion(),
        inspection = { metrics = metrics },
    }
end

local function compareItemConstraints(request)
    local loaded, loadError = loadConstraintBuild(request)
    if not loaded then
        return loadError
    end
    if not build.itemsTab or not build.itemsTab.slots or not build.itemsTab.slots[request.slot] then
        return errorResponse(request.requestId, "item-slot-missing", "The loaded build does not expose the requested equipment slot.", false)
    end

    local itemOk, replacementItem = pcall(function()
        return new("Item"):Item(request.itemText)
    end)
    if not itemOk then
        return errorResponse(request.requestId, "item-parse-failed", tostring(replacementItem), false)
    end
    if type(replacementItem) ~= "table" or not replacementItem.base then
        return errorResponse(request.requestId, "item-parse-failed", "PoB could not resolve a base type from the replacement item text.", false)
    end

    local compatibilityOk, compatible = pcall(function()
        return build.itemsTab:IsItemValidForSlot(replacementItem, request.slot)
    end)
    if not compatibilityOk then
        return errorResponse(request.requestId, "item-slot-validation-failed", tostring(compatible), true)
    end
    if not compatible then
        return errorResponse(request.requestId, "item-slot-incompatible", "The replacement item is not valid for the requested PoB slot in the current build state.", false)
    end

    local calcOk, replacementOutput = pcall(loaded.calcFunc, { repSlotName = request.slot, repItem = replacementItem })
    if not calcOk or type(replacementOutput) ~= "table" then
        return errorResponse(request.requestId, "item-replacement-calc-failed", tostring(replacementOutput), true)
    end

    local before = constraintSnapshot(loaded.baseOutput)
    local after = constraintSnapshot(replacementOutput)
    if not before or not after then
        return errorResponse(request.requestId, "constraint-output-missing", "PoB did not expose constraint output tables for both calculation states.", true)
    end

    return {
        protocolVersion = PROTOCOL_VERSION,
        requestId = request.requestId,
        ok = true,
        kernel = kernelVersion(),
        comparison = {
            slot = request.slot,
            before = before,
            after = after,
        },
    }
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
            health = { status = "ready", kernel = kernelVersion() },
        }
    end
    if request.operation == "inspect-build-constraints" then
        return inspectBuildConstraints(request)
    end
    return compareItemConstraints(request)
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
