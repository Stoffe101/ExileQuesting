-- Independent direct Path of Building flask-uptime reference runner.
--
-- This intentionally invokes pinned PoB's own ItemsTab:AddItemStatDifferences
-- method with a minimal fake tooltip. ExileQuesting does not reproduce the
-- upstream uptime formula here. The reference emits the raw PoB tooltip line so
-- the parity harness can parse it independently from the worker adapter.

local SENTINEL = "@@EXILEQUESTING_POB_FLASK_UPTIME_REFERENCE@@"

local fixturePath = arg[1]
if type(fixturePath) ~= "string" or fixturePath == "" then
    io.stderr:write("reference-flask-uptime.lua requires a fixture XML path as argv[1].\n")
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
    io.stderr:write("PoB flask uptime reference load failed: " .. tostring(loadError) .. "\n")
    os.exit(4)
end

if not build or not build.itemsTab or type(build.itemsTab.AddItemStatDifferences) ~= "function" then
    io.stderr:write("PoB flask uptime reference did not expose ItemsTab:AddItemStatDifferences.\n")
    os.exit(5)
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

local originalCompare = rawget(build, "AddStatComparesToTooltip")
build.AddStatComparesToTooltip = function()
    return 0
end

local results = {}
local success, captureError = pcall(function()
    for index = 1, 5 do
        local slotName = "Flask " .. index
        local slot, item = itemForSlot(slotName)
        if type(slot) == "table" and type(item) == "table" then
            if type(item.base) ~= "table" or not item.base.flask then
                error("Expected PoB flask item in " .. slotName)
            end
            local lines = {}
            local tooltip = {
                AddLine = function(_, _, text)
                    if type(text) == "string" then
                        table.insert(lines, text)
                    end
                end,
            }
            build.itemsTab:AddItemStatDifferences(tooltip, item, item.base, slot)
            local uptimeLine = nil
            for _, line in ipairs(lines) do
                if line:find("Flask uptime:", 1, true) then
                    uptimeLine = line
                    break
                end
            end
            table.insert(results, {
                slot = slotName,
                name = tostring(item.title or item.name or item.baseName or slotName),
                baseName = tostring(item.baseName or "Unknown Flask"),
                active = slot.active == true,
                uptimeLine = uptimeLine,
            })
        end
    end
end)

build.AddStatComparesToTooltip = originalCompare

if not success then
    io.stderr:write("PoB flask uptime tooltip capture failed: " .. tostring(captureError) .. "\n")
    os.exit(6)
end

io.stdout:write(SENTINEL .. json.encode({
    flasks = results,
}) .. "\n")
io.stdout:flush()
