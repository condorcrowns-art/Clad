--!strict
-- Trade rules, shared so the client can grey out an illegal trade before the
-- server has to reject it.
--
-- Trading is the single best retention system you can add to a pet game: it
-- creates a player-run economy, gives rare pulls a social value beyond their
-- multiplier, and turns "I have a duplicate" into "I have currency". It is also
-- the single easiest system to get scammed on, so every rule here exists
-- because someone, somewhere, lost a pet to its absence.

local Trading = {}

Trading.MAX_OFFER      = 6      -- familiars per side
Trading.MAX_DISTANCE   = 40     -- studs; both players must stay close
Trading.CONFIRM_WINDOW = 3      -- seconds a confirm must be held before it locks
Trading.REQUEST_TIMEOUT= 30     -- seconds before an unanswered request expires

-- Any change to either offer clears BOTH confirmations. This is the rule that
-- kills the classic swap-at-the-last-second scam, and it is non-negotiable.
Trading.RESET_ON_CHANGE = true

Trading.DECLINE_REASONS = {
	busy       = "That player is already trading.",
	distance   = "You're too far away from them.",
	self       = "You can't trade with yourself.",
	locked     = "Locked familiars can't be traded. Unlock it first.",
	full       = "Their familiar storage is full.",
	offerFull  = "You can only offer 6 familiars at a time.",
	notOwned   = "You don't own that familiar.",
	equipped   = "Unequip a familiar before trading it.",
	disabled   = "Trading is disabled on this server.",
	expired    = "That trade request expired.",
}

return Trading
