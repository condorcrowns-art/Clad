--!strict
-- Net.luau — one manifest of every RemoteEvent/RemoteFunction in the game.
-- The server creates them; the client waits for them. Neither side hardcodes a
-- string anywhere else, so a typo becomes a Luau error instead of a silent
-- "nothing happens when I click the button" bug.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Net = {}

Net.EVENTS = {
    "StateSync",      -- S->C  full/partial profile push
    "Notify",         -- S->C  toast message
    "CatchCritter",   -- C->S  player touched a critter
    "FeedGoob",       -- C->S  push stomach items (auto, but kept explicit)
    "RenameGoob",     -- C->S
    "SetActiveGoob",  -- C->S  choose which Goob sits on your plot
    "BuySnack",       -- C->S  spend Glob on feedstock rolls
    "BuyEgg",         -- C->S  hatch a new Goob (the only source of new Goobs)
    "DismissTutorial",-- C->S  stop showing the first-run guide
    "Ascend",         -- C->S  consume a Colossal Goob for a permanent Crest
    "Dashed",         -- C->S  cosmetic: tell the server a dash happened
    "GulpGoob",       -- C->S  feed one of my Goobs to another
    "TradeRequest",   -- C->S
    "TradeRespond",   -- C->S
    "TradeOffer",     -- C->S  put/remove a Goob in a slot
    "TradeConfirm",   -- C->S
    "TradeCancel",    -- C->S
    "TradeSync",      -- S->C  live state of the open trade window
    "LeaderboardSync",-- S->C
}

Net.FUNCTIONS = {
    "RequestProfile", -- C->S  initial load
    "RequestGoob",    -- C->S  inspect another player's Goob (for trade vetting)
}

local folder: Folder

function Net.init(): Folder
    assert(RunService:IsServer(), "Net.init must run on the server")
    folder = Instance.new("Folder")
    folder.Name = "GoobNet"
    for _, name in ipairs(Net.EVENTS) do
        local r = Instance.new("RemoteEvent")
        r.Name = name
        r.Parent = folder
    end
    for _, name in ipairs(Net.FUNCTIONS) do
        local r = Instance.new("RemoteFunction")
        r.Name = name
        r.Parent = folder
    end
    folder.Parent = ReplicatedStorage
    return folder
end

function Net.get(name: string): any
    if not folder then
        folder = ReplicatedStorage:WaitForChild("GoobNet") :: Folder
    end
    return folder:WaitForChild(name)
end

return Net
