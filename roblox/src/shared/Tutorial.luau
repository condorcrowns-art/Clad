--!strict
-- Tutorial.luau — the first-run guided loop.
--
-- WHY THIS IS NOT OPTIONAL. A new player spawns next to a blob with some junk
-- floating around it. Nothing on screen says that running into the junk feeds
-- the blob, and nothing at all hints that the central mechanic — destroying one
-- Goob to grow another — exists. The entire design thesis is invisible until
-- somebody tells you about it.
--
-- So this walks a new player through the whole loop in about two minutes:
-- catch → digest → buy → hatch → gulp → trade. Each step is a single sentence
-- with one verb, and it advances on the player actually DOING the thing rather
-- than on a timer or a "Next" button.

local Tutorial = {}

export type Step = {
    id: string,
    text: string,
    hint: string?,
    target: string?,   -- UI element to pulse: "snack" | "drawer" | "egg" | nil
    goal: number?,     -- for counted steps
}

Tutorial.STEPS = {
    {
        id = "catch",
        text = "Run into the junk to feed your Goob!",
        hint = "No clicking — just touch it.",
        goal = 5,
    },
    {
        id = "digest",
        text = "Nice! Your Goob is digesting it.",
        hint = "Watch ⚡ climb. Bigger Goob = more 💧 per second.",
    },
    {
        id = "snack",
        text = "Spend 💧 on a Snack.",
        hint = "Food you don't have to chase. Bottom left.",
        target = "snack",
    },
    {
        id = "egg",
        text = "Open 🫧 MY GOOBS and hatch a second Goob.",
        hint = "A place to keep Goobs you trade for.",
        target = "drawer",
    },
    {
        id = "gulp",
        text = "Now GULP the new one into your big one.",
        hint = "It's gone forever — but yours keeps 75% of it. That's the whole game.",
        target = "drawer",
    },
    {
        id = "done",
        text = "You've got it. Go find someone to trade with!",
        hint = "Stand in the gold 🤝 zone at the hub with another player.",
    },
}

local byId: { [string]: number } = {}
for i, step in ipairs(Tutorial.STEPS) do
    byId[step.id] = i
end

function Tutorial.indexOf(id: string): number?
    return byId[id]
end

function Tutorial.step(index: number): Step?
    return Tutorial.STEPS[index]
end

function Tutorial.isLast(index: number): boolean
    return index >= #Tutorial.STEPS
end

-- A fresh tutorial record. `caught` counts only toward the first step.
function Tutorial.blank()
    return { step = 1, caught = 0, done = false, dismissed = false }
end

-- Advance if `event` is what the current step is waiting for. Returns the new
-- state and whether it moved, so the caller can decide whether to notify.
function Tutorial.advance(state: any, event: string): (any, boolean)
    if not state or state.done or state.dismissed then return state, false end

    local step = Tutorial.STEPS[state.step]
    if not step then
        state.done = true
        return state, false
    end

    if step.id ~= event then return state, false end

    -- Counted steps need `goal` occurrences before moving on.
    if step.goal then
        state.caught = (state.caught or 0) + 1
        if state.caught < step.goal then return state, false end
    end

    state.step += 1
    -- `>=`, not `>`. The final entry is a closing message with no event of its
    -- own, so the index can never go past it — with `>` the tutorial stayed
    -- flagged as in-progress forever once a player reached the end.
    if state.step >= #Tutorial.STEPS then
        state.step = #Tutorial.STEPS
        state.done = true
    end
    return state, true
end

-- What the HUD should show right now, or nil once it's finished.
function Tutorial.display(state: any)
    if not state or state.dismissed then return nil end
    local step = Tutorial.STEPS[state.step]
    if not step then return nil end

    local progress = nil
    if step.goal then
        progress = ("%d / %d"):format(math.min(state.caught or 0, step.goal), step.goal)
    end

    return {
        id = step.id,
        index = state.step,
        total = #Tutorial.STEPS,
        text = step.text,
        hint = step.hint,
        target = step.target,
        progress = progress,
        done = state.done == true,
    }
end

return Tutorial
