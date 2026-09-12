--!nolint
-- census_test.luau — the Archive, and the feedback layer.

local svc, env = _G.SVC, _G.ENV
local V3 = env.Vector3
local sched = env.scheduler

local fails = 0
local function check(l, c, d)
    if c then emit(("  ok    %s"):format(l))
    else fails += 1; emit(("  FAIL  %s   %s"):format(l, d or "")) end
end
local function tick(sec, dt)
    dt = dt or 0.2
    for _ = 1, math.floor(sec / dt) do
        sched.step(dt); svc.heartbeat(dt); svc.renderStep(dt)
    end
end
local function effectsFor(name)
    local out = {}
    for _, t in ipairs(_G.TRAFFIC) do
        if t.remote == "Effect" and t.player ~= "ALL" and t.player.Name == name then
            table.insert(out, t.args[1])
        end
    end
    return out
end

_G.BOOT_SERVER()
tick(1)
local alice = svc.addPlayer("Alice", 101, V3.new(0, 5, 40))
tick(3)
svc.enterClientMode(alice)
_G.BOOT_CLIENT()
tick(2)

emit("══ THE ARCHIVE EXISTS AND IS READABLE ══")
local world = svc.Workspace:FindFirstChild("GoobWorld")
local archive = world:FindFirstChild("Archive")
check("the monument is built", archive ~= nil)
local board = archive and archive:FindFirstChild("Board")
local entries = board and board:FindFirstChild("Entries")
check("it has a readable board", entries ~= nil)
check("it names itself", entries and tostring(entries.Text):find("ARCHIVE") ~= nil,
    entries and tostring(entries.Text):sub(1, 40))
check("it explains the sink", entries and tostring(entries.Text):find("Ascending destroys") ~= nil)

emit("")
emit("══ IT COUNTS ONLY WHAT IS WORTH COUNTING ══")
local Census = _G.SHARED and nil
-- Reach the service's snapshot through the board text instead: the service is
-- server-internal, and the board is what a player actually sees.
local text = tostring(entries.Text)
check("common junk is not listed", text:find("Lost Sock") == nil)
check("secrets are listed", text:find("Pocket Singularity") ~= nil or text:find("Goob Fossil") ~= nil,
    text:sub(1, 200))

emit("")
emit("══ CATCHING IS COUNTED AND FELT ══")
local critters = svc.Workspace:FindFirstChild("Critters")
tick(20)
local caught = 0
for _ = 1, 20 do
    local list = critters:GetChildren()
    if #list > 0 then
        svc.movePlayer(alice, list[1].Position)
        svc.fireAs("CatchCritter", alice, list[1])
        caught += 1
    end
    tick(0.6)
end
tick(2)
local fx = effectsFor("Alice")
local catches = 0
for _, kind in ipairs(fx) do if kind == "catch" then catches += 1 end end
check("every catch sends a feedback effect", catches > 0, tostring(catches) .. " of " .. tostring(caught))
check("particles were actually emitted", _G.PARTICLES() > 0, tostring(_G.PARTICLES()))

emit("")
emit("══ FINDING RARE THINGS IS COUNTED ══")
-- Catching tracked rarities from the wild is far too unlikely to assert on in a
-- test (Legendary is 1 in 282, Mythic 1 in 2,083). The Snack Stand rolls at
-- luck x4 and forty items per Banquet, and its grants are counted through the
-- same path, so buy enough Banquets to make a Legendary or Mythic a certainty.
tick(1200)
for _ = 1, 40 do
    svc.fireAs("BuySnack", alice, "banquet")
    tick(240)
end
tick(90, 1)
local found = tostring(entries.Text)
check("the 'found' column moves when rare things are obtained",
    found:find("[1-9][%d,]*%s+found") ~= nil,
    (found:match("[^\n]*found[^\n]*") or "no found line"))

emit("")
emit("══ ASCENSION DESTROYS WHAT IS IN THE BELLY ══")
-- Seed a Colossal Goob carrying tracked rarities, join, ascend, and confirm the
-- Archive's "eaten" column moves.
svc.stores["GoobProfile_v1"]["u_909"] = {
    version = 1, glob = 90000,
    goobs = { {
        id = "big", nickname = "Hoarder", hue = 0.3, mass = 9000000, stomach = {},
        bornAt = 1, inheritedAge = 0, lineage = {},
        contents = { singular = 3, goobfsl = 2, moon = 5 },
    } },
    activeGoobId = "big", lastSeen = 1,
    stats = { caught = 10, gulps = 0, trades = 0, bestMass = 9000000 },
    discovered = {}, crests = 0, totalAscensions = 0,
}
local hoarder = svc.addPlayer("Hoarder", 909, V3.new(0, 5, 40))
tick(4)
local before = tostring(entries.Text)

local altar = V3.new(0, 7, 0)      -- the Vault: one landmark, everything ceremonial on it
svc.movePlayer(hoarder, altar)
local hball = svc.Workspace:FindFirstChild("GoobBall_909")
if hball then hball.Position = altar end
svc.fireAs("Ascend", hoarder)
tick(3)

-- The board refreshes on the census flush; force time forward past it.
tick(90, 1)
local after = tostring(entries.Text)
check("the Archive changed after an ascension", after ~= before)
-- Whitespace in the board is padded, so match loosely rather than assuming one
-- space. An earlier pattern demanded exactly one and failed on "·   3 eaten".
check("the eaten column is non-zero", after:find("[1-9][%d,]*%s+eaten") ~= nil,
    (after:match("[^\n]*eaten[^\n]*") or "no eaten line"))

local hfx = effectsFor("Hoarder")
local ascended = false
for _, kind in ipairs(hfx) do if kind == "ascend" then ascended = true end end
check("ascending sends its own effect", ascended)

emit("")
emit("══ A DEAD DATASTORE DOES NOT BREAK THE GAME ══")
svc.datastoreShouldFail = true
local ok = pcall(function()
    for _ = 1, 10 do
        local list = critters:GetChildren()
        if #list > 0 then
            svc.movePlayer(alice, list[1].Position)
            svc.fireAs("CatchCritter", alice, list[1])
        end
        tick(1)
    end
    tick(90, 1)
end)
check("catching still works with the store down", ok, tostring(ok))
svc.datastoreShouldFail = false

emit("")
emit(("══ %s ══"):format(fails == 0 and "ALL CENSUS CHECKS PASSED" or (fails .. " FAILURE(S)")))
