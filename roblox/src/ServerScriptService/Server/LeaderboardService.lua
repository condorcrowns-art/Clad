--!strict
-- Global leaderboards via OrderedDataStore, rendered onto physical boards in
-- the starter sector. Public ranking is one of the strongest long-tail
-- retention levers in the genre -- people grind for a name on a wall.

local DataStoreService = game:GetService("DataStoreService")
local Players          = game:GetService("Players")
local Workspace        = game:GetService("Workspace")

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Zones  = require(Shared.Zones)
local Format = require(Shared.Util.Format)

local DataService  = require(script.Parent.DataService)
local WorldService = require(script.Parent.WorldService)

local LeaderboardService = {}

local BOARDS = {
	{ key = "rebirths", title = "\u{267B} TOP OVERCLOCKS", store = "LB_Rebirths_v1", fmt = tostring },
	{ key = "bits",     title = "\u{1F4A0} TOP BITS",      store = "LB_Bits_v1",     fmt = Format.short },
	{ key = "hatched",  title = "\u{1F95A} TOP HATCHERS",  store = "LB_Hatched_v1",  fmt = Format.comma },
}

local REFRESH = 120
local TOP_N = 15

local function valueFor(key: string, data): number
	if key == "rebirths" then return data.rebirths end
	if key == "bits"     then return math.min(data.totalBits, 9.2e18) end
	if key == "hatched"  then return data.stats.hatched end
	return 0
end

local function buildBoard(index: number, board)
	local origin = Vector3.new(-60 + (index - 1) * 60, 14, 100)
	local part = Instance.new("Part")
	part.Name = "Leaderboard_" .. board.key
	part.Size = Vector3.new(44, 28, 2)
	part.CFrame = CFrame.new(origin) * CFrame.Angles(0, math.rad(180), 0)
	part.Anchored = true
	part.Color = Color3.fromRGB(14, 16, 26)
	part.Material = Enum.Material.SmoothPlastic
	part.Parent = Workspace

	local gui = Instance.new("SurfaceGui")
	gui.Name = "Board"
	gui.Face = Enum.NormalId.Back
	gui.CanvasSize = Vector2.new(440, 280)
	gui.AlwaysOnTop = false
	gui.LightInfluence = 0
	gui.Parent = part

	local frame = Instance.new("Frame")
	frame.Size = UDim2.fromScale(1, 1)
	frame.BackgroundColor3 = Color3.fromRGB(14, 16, 26)
	frame.BorderSizePixel = 0
	frame.Parent = gui

	local title = Instance.new("TextLabel")
	title.Size = UDim2.new(1, 0, 0, 34)
	title.BackgroundTransparency = 1
	title.Font = Enum.Font.GothamBlack
	title.TextScaled = true
	title.TextColor3 = Color3.fromRGB(120, 220, 255)
	title.Text = board.title
	title.Parent = frame

	local list = Instance.new("Frame")
	list.Name = "List"
	list.Position = UDim2.new(0, 8, 0, 38)
	list.Size = UDim2.new(1, -16, 1, -46)
	list.BackgroundTransparency = 1
	list.Parent = frame

	local layout = Instance.new("UIListLayout")
	layout.Padding = UDim.new(0, 2)
	layout.SortOrder = Enum.SortOrder.LayoutOrder
	layout.Parent = list

	return list
end

local function render(list: Frame, pages, fmt)
	for _, c in ipairs(list:GetChildren()) do
		if c:IsA("TextLabel") then c:Destroy() end
	end
	for rank, entry in ipairs(pages) do
		local row = Instance.new("TextLabel")
		row.Size = UDim2.new(1, 0, 0, 14)
		row.LayoutOrder = rank
		row.BackgroundTransparency = 1
		row.Font = Enum.Font.GothamBold
		row.TextXAlignment = Enum.TextXAlignment.Left
		row.TextScaled = true
		row.TextColor3 = if rank == 1 then Color3.fromRGB(255, 215, 0)
			elseif rank == 2 then Color3.fromRGB(210, 220, 235)
			elseif rank == 3 then Color3.fromRGB(210, 150, 90)
			else Color3.fromRGB(180, 190, 210)
		row.Text = ("%2d. %-18s %s"):format(rank, entry.name, fmt(entry.value))
		row.Parent = list
	end
end

function LeaderboardService.start()
	local lists = {}
	for i, board in ipairs(BOARDS) do
		lists[board.key] = buildBoard(i, board)
		board.ods = DataStoreService:GetOrderedDataStore(board.store)
	end

	-- Push local values up on a timer (and once on leave, via DataService).
	task.spawn(function()
		while true do
			task.wait(REFRESH)
			for _, player in ipairs(Players:GetPlayers()) do
				local data = DataService.get(player)
				if data then
					for _, board in ipairs(BOARDS) do
						pcall(function()
							board.ods:SetAsync(tostring(player.UserId), math.floor(valueFor(board.key, data)))
						end)
					end
				end
				task.wait(0.4)
			end
		end
	end)

	-- Pull the top N down and render.
	task.spawn(function()
		while true do
			for _, board in ipairs(BOARDS) do
				local ok, pages = pcall(function()
					return board.ods:GetSortedAsync(false, TOP_N):GetCurrentPage()
				end)
				if ok and pages then
					local rows = {}
					for _, entry in ipairs(pages) do
						local name = "Player"
						pcall(function()
							name = Players:GetNameFromUserIdAsync(tonumber(entry.key) :: number)
						end)
						table.insert(rows, { name = name, value = entry.value })
					end
					render(lists[board.key], rows, board.fmt)
				end
				task.wait(3)
			end
			task.wait(REFRESH)
		end
	end)
end

return LeaderboardService
