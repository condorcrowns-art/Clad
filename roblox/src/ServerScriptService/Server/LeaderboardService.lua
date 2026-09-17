--!strict
-- Global leaderboards via OrderedDataStore, rendered onto physical boards in
-- the starter sector. Public ranking is one of the strongest long-tail
-- retention levers in the genre -- people grind for a name on a wall.

local DataStoreService = game:GetService("DataStoreService")
local Players          = game:GetService("Players")

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
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

-- The physical boards are positioned by WorldService (relative to the starter
-- sector's spawn, in a row, all facing the same way). This function only
-- builds the SurfaceGui onto the backing part it is handed.
local function buildBoardGui(backing: BasePart, board): Frame
	local gui = Instance.new("SurfaceGui")
	gui.Name = "Board"
	gui.Face = Enum.NormalId.Back
	gui.CanvasSize = Vector2.new(460, 300)
	gui.LightInfluence = 0
	gui.Parent = backing

	local frame = Instance.new("Frame")
	frame.Size = UDim2.fromScale(1, 1)
	frame.BackgroundColor3 = Color3.fromRGB(12, 14, 22)
	frame.BorderSizePixel = 0
	frame.Parent = gui

	local title = Instance.new("TextLabel")
	title.Size = UDim2.new(1, 0, 0, 40)
	title.BackgroundTransparency = 1
	title.Font = Enum.Font.GothamBlack
	title.TextScaled = true
	title.TextColor3 = Color3.fromRGB(120, 220, 255)
	title.Text = board.title
	title.Parent = frame

	local underline = Instance.new("Frame")
	underline.Position = UDim2.new(0, 20, 0, 42)
	underline.Size = UDim2.new(1, -40, 0, 2)
	underline.BorderSizePixel = 0
	underline.BackgroundColor3 = Color3.fromRGB(120, 220, 255)
	underline.BackgroundTransparency = 0.5
	underline.Parent = frame

	local list = Instance.new("Frame")
	list.Name = "List"
	list.Position = UDim2.new(0, 12, 0, 50)
	list.Size = UDim2.new(1, -24, 1, -58)
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
	local backings = WorldService.buildLeaderboardWall(BOARDS)
	local lists = {}
	for _, board in ipairs(BOARDS) do
		local backing = backings[board.key]
		if backing then lists[board.key] = buildBoardGui(backing, board) end
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
				if ok and pages and lists[board.key] then
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
