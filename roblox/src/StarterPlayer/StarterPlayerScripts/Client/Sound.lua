--!strict
-- Audio. Every id comes from Shared/Assets.lua and every one defaults to 0,
-- which means silence rather than an error -- so the game ships playable and
-- gets its audio the moment you paste free Creator Store sound ids in.
--
-- Simulators are played for hours. A hit sound that is fine once is agony at
-- 10,000 repetitions, so the mining sound is pitch-varied per swing and
-- volume-capped well below the music.

local SoundService = game:GetService("SoundService")

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Assets = require(Shared.Assets)

local Sound = {}

local pool: { [string]: Sound } = {}
local music: Sound? = nil

local function get(key: string): Sound?
	local id = Assets.soundId(key)
	if not id then return nil end

	local existing = pool[key]
	if existing then return existing end

	local s = Instance.new("Sound")
	s.Name = "sfx_" .. key
	s.SoundId = id
	s.Volume = Assets.SFX_VOLUME
	s.Parent = SoundService
	pool[key] = s
	return s
end

-- Pitch variance keeps a repeated sound from turning into a machine gun.
function Sound.play(key: string, pitchRange: number?)
	local s = get(key)
	if not s then return end
	local range = pitchRange or 0.06
	s.PlaybackSpeed = 1 + (math.random() - 0.5) * 2 * range
	s:Play()
end

-- Positional one-shot, for things other players should hear.
function Sound.playAt(key: string, position: Vector3, pitchRange: number?)
	local id = Assets.soundId(key)
	if not id then return end

	local part = Instance.new("Part")
	part.Anchored = true
	part.CanCollide = false
	part.CanQuery = false
	part.Transparency = 1
	part.Size = Vector3.one
	part.Position = position
	part.Parent = workspace

	local s = Instance.new("Sound")
	s.SoundId = id
	s.Volume = Assets.SFX_VOLUME
	s.RollOffMaxDistance = 140
	s.PlaybackSpeed = 1 + (math.random() - 0.5) * 2 * (pitchRange or 0.06)
	s.Parent = part
	s:Play()

	game:GetService("Debris"):AddItem(part, 5)
end

function Sound.startMusic()
	local id = Assets.soundId("music")
	if not id or music then return end
	local s = Instance.new("Sound")
	s.Name = "Music"
	s.SoundId = id
	s.Volume = Assets.MUSIC_VOLUME
	s.Looped = true
	s.Parent = SoundService
	s:Play()
	music = s
end

function Sound.setMusicEnabled(on: boolean)
	if music then music.Volume = if on then Assets.MUSIC_VOLUME else 0 end
end

return Sound
