--!strict
-- Central tuning knobs. Everything a designer touches lives here or in the
-- sibling data modules (Zones / Tools / Buffers / Pets / Rebirths).
--
-- Balance philosophy (this is the whole game in four numbers):
--   * A player should SELL every 25-40 seconds in the early game. That cadence
--     is the dopamine clock -- too fast feels weightless, too slow feels grindy.
--   * Each zone should take ~1.6x as long to "beat" as the previous one, and
--     each tool should cut that time by ~45%. Net: steady, always-close upgrade.
--   * Pets are a pure multiplier lane so whales and grinders both have a road.
--   * Rebirth resets the economy but keeps pets, so the reset never feels lossy.

local Config = {}

Config.GAME_NAME = "OVERCLOCK SIMULATOR"

-- Currencies ---------------------------------------------------------------
Config.CURRENCY = {
	Bits   = { name = "Bits",   icon = "\u{1F4A0}", leaderstat = true  },
	Shards = { name = "Shards", icon = "\u{1F48E}", leaderstat = true  },
	Rebirths = { name = "Rebirths", icon = "\u{267B}", leaderstat = true },
}

-- Core loop ----------------------------------------------------------------
Config.SWING_COOLDOWN   = 0.32   -- seconds between valid swings (server-enforced)
Config.SWING_GRACE      = 0.05   -- latency forgiveness on the cooldown check
Config.MAX_SWING_REACH  = 34     -- studs; beyond this the swing is rejected
Config.NODE_RESPAWN     = 6      -- seconds a mined node stays broken
Config.AUTOSAVE_INTERVAL = 90    -- seconds

-- Sell ---------------------------------------------------------------------
Config.SELL_RADIUS      = 18     -- studs from an Uplink pad to auto-sell
Config.AUTO_SELL_TICK   = 1.0    -- seconds between auto-sell passes (gamepass)

-- Offline / rejoin ---------------------------------------------------------
Config.OFFLINE_CAP_HOURS = 8     -- offline earnings cap (VIP only, see below)
Config.OFFLINE_RATE      = 0.25  -- fraction of active income earned offline

-- Luck ---------------------------------------------------------------------
Config.BASE_LUCK = 1.0

-- Progression pacing -------------------------------------------------------
Config.REBIRTH_BONUS_PER = 0.15  -- +15% multiplicative Bits per rebirth

-- Anti-cheat ---------------------------------------------------------------
Config.RATE_LIMITS = {
	Swing      = { window = 1.0, max = 6  },
	Sell       = { window = 1.0, max = 4  },
	Buy        = { window = 1.0, max = 8  },
	Hatch      = { window = 1.0, max = 12 },
	Equip      = { window = 1.0, max = 15 },
	Rebirth    = { window = 5.0, max = 2  },
	Code       = { window = 3.0, max = 3  },
}

-- Data ---------------------------------------------------------------------
Config.DATASTORE_NAME    = "OverclockSim_PlayerData_v1"
Config.DATASTORE_SCOPE   = "live"
Config.SESSION_LOCK_TTL  = 120   -- seconds before a stale lock is stolen
Config.DATA_VERSION      = 1

return Config
