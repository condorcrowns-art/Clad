--!strict
-- ViewportFrame helper: renders a real 3D familiar or egg inside a UI frame.
--
-- This is what makes a pet list feel like a pet game instead of a spreadsheet.
-- The same ModelFactory that builds world models builds these, so a model you
-- drop into Assets.lua shows up in the world, the hatch reveal and the
-- inventory at once -- one asset, three places, no extra work.

local RunService = game:GetService("RunService")

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Pets         = require(Shared.Pets)
local ModelFactory = require(Shared.ModelFactory)

local Viewport = {}

local spinning: { [ViewportFrame]: { model: Model, angle: number, speed: number } } = {}

-- One shared RenderStepped connection for every viewport on screen. Forty
-- individual connections is a real frame cost for identical work.
RunService.RenderStepped:Connect(function(dt)
	for frame, entry in pairs(spinning) do
		if not frame.Parent then
			spinning[frame] = nil
		elseif frame.Visible and entry.model.PrimaryPart then
			entry.angle += dt * entry.speed
			entry.model:PivotTo(CFrame.Angles(0, entry.angle, 0))
		end
	end
end)

local function mount(parent: GuiObject, model: Model, distance: number, height: number, zIndex: number?): ViewportFrame
	local frame = Instance.new("ViewportFrame")
	frame.Size = UDim2.fromScale(1, 1)
	frame.BackgroundTransparency = 1
	frame.Ambient = Color3.fromRGB(200, 200, 215)
	frame.LightColor = Color3.fromRGB(255, 255, 255)
	frame.LightDirection = Vector3.new(-0.4, -1, -0.6)
	frame.ZIndex = zIndex or 10
	frame.Parent = parent

	local camera = Instance.new("Camera")
	camera.FieldOfView = 35
	camera.CFrame = CFrame.lookAt(
		Vector3.new(0, height, distance),
		Vector3.new(0, height * 0.62, 0))
	camera.Parent = frame
	frame.CurrentCamera = camera

	model.Parent = frame
	if model.PrimaryPart then
		model:PivotTo(CFrame.new())
	end

	spinning[frame] = { model = model, angle = 0, speed = 0.7 }
	return frame
end

-- A familiar, coloured by species and variant.
function Viewport.pet(parent: GuiObject, petId: string, variantId: string?, zIndex: number?): ViewportFrame?
	local def = Pets.byId[petId]
	if not def then return nil end
	local variant = Pets.variantById[variantId or "normal"]
	local isVariant = variant ~= nil and variant.id ~= "normal"

	local model = ModelFactory.buildPet(
		petId,
		def.color,
		isVariant and variant.color or nil,
		isVariant)

	return mount(parent, model, 4.6, 1.5, zIndex)
end

function Viewport.egg(parent: GuiObject, eggId: string, color: Color3, accent: Color3, zIndex: number?): ViewportFrame
	local model = ModelFactory.buildEgg(eggId, color, accent)
	-- Hide the pedestal in UI -- it reads as clutter at icon size.
	for _, d in ipairs(model:GetDescendants()) do
		if d:IsA("BasePart") and (d.Name == "Pedestal" or d.Name == "PedestalRing") then
			d:Destroy()
		end
	end
	return mount(parent, model, 9.5, 2.6, zIndex)
end

function Viewport.release(frame: ViewportFrame?)
	if frame then
		spinning[frame] = nil
		frame:Destroy()
	end
end

return Viewport
