#!/usr/bin/env bash
# run_all.sh — the whole verification suite. Run from roblox/tools.
set -euo pipefail
# Install from the committed package.json so the Luau compiler version is the
# one this suite was validated against. Installing the package by NAME instead
# takes whatever is latest, which quietly changes what "passing" means.
[ -d node_modules ] || npm install --silent
[ -f apidump.json ] || curl -sSo apidump.json \
  https://raw.githubusercontent.com/MaximumADHD/Roblox-Client-Tracker/roblox/API-Dump.json

echo "── 1. compile every module ──"
node check.mjs ../src/shared/*.luau ../src/server/*.luau ../src/client/*.luau

echo "── 2. Roblox API validation ──"
python3 apicheck.py ../src/shared/*.luau ../src/server/*.luau ../src/client/*.luau
python3 apicheck_tables.py
python3 scopecheck.py ../src/shared/*.luau ../src/server/*.luau ../src/client/*.luau

echo "── 3. economy correctness ──"
node sim.mjs ../src/shared tests.luau

echo "── 4. integration: boot the real server and play it ──"
node integration.mjs .. integration.luau

echo "── 5. client: boot the real UI and click it ──"
node integration.mjs .. client_test.luau

echo "── 6. roll + world + ascension ──"
node integration.mjs .. roll_test.luau

echo "── 8. mobile: every panel on 5 real device sizes ──"
node integration.mjs .. mobile_test.luau

echo "── 9. live systems: cosmetics · season · pit · crews ──"
node integration.mjs .. live_test.luau

echo "── 10. census + juice: the Archive and the feel layer ──"
node integration.mjs .. census_test.luau

echo "── 11. rounds: the lobby/round cycle and deflation ──"
node integration.mjs .. rounds_test.luau

echo "── 12. powers: press every power, with a second player ──"
node integration.mjs .. powers_test.luau

echo "── 13. adversarial: attack it ──"
node integration.mjs .. adversarial.luau

echo "── 14. bots: the rest of the field ──"
node integration.mjs .. bots_test.luau

echo "── 15. goop: split, tethers and spore pods ──"
node integration.mjs .. goop_test.luau

echo "── 12. balance sweeps"
node sim.mjs ../src/shared move.luau
node sim.mjs ../src/shared fmt.luau
echo "── 13. arena: the agar layer ──"
node sim.mjs ../src/shared arena.luau
node sim.mjs ../src/shared crates.luau
echo "── 14. economy sweeps ──"
node sim.mjs ../src/shared season.luau
node sim.mjs ../src/shared pit.luau
node sim.mjs ../src/shared systems.luau
node sim.mjs ../src/shared feeding.luau

echo
echo "ALL SUITES PASSED"
