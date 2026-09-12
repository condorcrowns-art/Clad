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
-- eat → melt → bank → power → trade. Each step is a single sentence with one
-- verb, and it advances on the player actually DOING the thing rather than on
-- a timer or a "Next" button.
--
-- THE STEP THAT MATTERS IS "melt". Every other mechanic here is one a kid can
-- guess: run into food, get bigger. Melting is the one thing in this game that
-- is not guessable and is not like any other game they have played, and if
-- they learn it by watching their number fall for no visible reason they will
-- read it as the game being broken rather than as the game being tense. So it
-- gets its own step, in plain words, at the exact moment it starts happening.

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
        id = "eat",
        text = "Roll into the blobs of goo to eat them!",
        hint = "No clicking — just touch them.",
        goal = 12,
    },
    {
        -- Counted, and counted high on purpose. The melt event fires on every
        -- arena tick while you are above the grace mass, so without a goal the
        -- step advanced on the very next frame and the player never saw the
        -- one lesson in this game they cannot guess. 40 ticks is about three
        -- seconds of it sitting on screen while it is visibly happening.
        id = "melt",
        goal = 40,
        text = "Careful — now you're MELTING.",
        hint = "The bigger you get, the faster you drip. Everything you drip is food for everyone else.",
    },
    {
        id = "bank",
        text = "Get to the 🏦 VAULT in the middle and hold still.",
        hint = "Banking turns your size into 💧 you keep forever. Nothing else is safe.",
    },
    {
        id = "power",
        text = "Press your power button.",
        hint = "One button, and it costs a slice of you. That slice lands on the floor as food.",
    },
    {
        id = "done",
        text = "That's the whole game. Eat, melt, bank, repeat.",
        hint = "Stay out too long and you shrink. Bank too early and you leave 💧 behind.",
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

    -- Reset the counter. It was shared across every counted step, so a second
    -- one inherited the first's total and completed instantly — which is how
    -- the melt lesson flashed past before anyone could read it.
    state.caught = 0
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
