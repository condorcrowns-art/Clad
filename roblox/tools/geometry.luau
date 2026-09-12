--!nolint
-- geometry.luau — resolve AbsolutePosition / AbsoluteSize for a GUI tree.
--
-- Roblox computes these natively; the harness does not, so every "does this fit
-- on a phone?" assertion would otherwise be me asserting my own opinion about
-- numbers I wrote. This walks the tree applying the real UDim2 rules:
--
--   size = Scale * parentSize + Offset
--   pos  = parentPos + (Scale * parentSize + Offset) - AnchorPoint * size
--
-- UIListLayout children are stacked in LayoutOrder with the layout's Padding,
-- which is an approximation but the correct one for the lists this game uses.

local env = require("roblox_env")

local G = {}

local function udim(axis, parentPx)
    return (axis.Scale or 0) * parentPx + (axis.Offset or 0)
end

local function isGui(inst)
    return inst.IsA and (inst:IsA("GuiObject") or inst:IsA("LayerCollector"))
end

-- Returns a flat list of { inst, pos = {x,y}, size = {x,y}, depth }
function G.resolve(screenGui, viewportW, viewportH, topInset)
    local out = {}
    local rootPos = { x = 0, y = 0 }
    local rootSize = { x = viewportW, y = viewportH }

    -- IgnoreGuiInset = false means the GUI starts below the Roblox top bar.
    if screenGui.IgnoreGuiInset ~= true then
        rootPos.y = topInset or 0
        rootSize.y = viewportH - (topInset or 0)
    end

    local function walk(parent, pPos, pSize, depth, parentVisible)
        -- Detect a UIListLayout so stacked children get sensible positions.
        local layout, padding = nil, 0
        for _, c in ipairs(parent:GetChildren()) do
            if c.IsA and c:IsA("UIListLayout") then
                layout = c
                padding = (c.Padding and c.Padding.Offset) or 0
            end
        end

        local cursor = 0
        local kids = {}
        for _, c in ipairs(parent:GetChildren()) do
            if isGui(c) then table.insert(kids, c) end
        end
        table.sort(kids, function(a, b)
            return (a.LayoutOrder or 0) < (b.LayoutOrder or 0)
        end)

        for _, c in ipairs(kids) do
            local sz = c.Size or env.UDim2.new(0, 0, 0, 0)
            local ps = c.Position or env.UDim2.new(0, 0, 0, 0)
            local anchor = c.AnchorPoint or env.Vector2.new(0, 0)

            local w = udim(sz.X, pSize.x)
            local h = udim(sz.Y, pSize.y)

            local x, y
            if layout then
                x = pPos.x
                y = pPos.y + cursor
                cursor += h + padding
            else
                x = pPos.x + udim(ps.X, pSize.x) - (anchor.X or 0) * w
                y = pPos.y + udim(ps.Y, pSize.y) - (anchor.Y or 0) * h
            end

            -- Visibility is INHERITED. A child of a hidden panel is not on
            -- screen no matter what its own Visible says, and treating it as
            -- visible made every control inside the closed drawer look like a
            -- 450px overflow.
            local vis = parentVisible and (c.Visible ~= false)

            table.insert(out, {
                inst = c, name = c.Name, class = c.ClassName,
                x = x, y = y, w = w, h = h, depth = depth,
                visible = vis,
            })
            walk(c, { x = x, y = y }, { x = w, y = h }, depth + 1, vis)
        end
    end

    walk(screenGui, rootPos, rootSize, 0, screenGui.Enabled ~= false)
    return out, rootPos, rootSize
end

-- Anything sticking out past the screen edges.
function G.offscreen(boxes, viewportW, viewportH, onlyVisible)
    local bad = {}
    for _, b in ipairs(boxes) do
        if (not onlyVisible) or b.visible then
            if b.w > 0 and b.h > 0 then
                local overRight  = (b.x + b.w) - viewportW
                local overBottom = (b.y + b.h) - viewportH
                local overLeft   = -b.x
                local overTop    = -b.y
                local worst = math.max(overRight, overBottom, overLeft, overTop)
                if worst > 1 then
                    table.insert(bad, { box = b, over = worst })
                end
            end
        end
    end
    table.sort(bad, function(a, b) return a.over > b.over end)
    return bad
end

-- Does a box overlap a rectangle (used for the mobile touch-control zones)?
function G.overlaps(b, rx, ry, rw, rh)
    return b.x < rx + rw and b.x + b.w > rx and b.y < ry + rh and b.y + b.h > ry
end

return G
