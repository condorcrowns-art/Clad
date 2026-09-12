#!/usr/bin/env bash
# run_all.sh — the whole verification suite. Run from roblox/tools.
set -euo pipefail
[ -d node_modules ] || npm install --silent @luau-rs/luau
[ -f apidump.json ] || curl -sSo apidump.json \
  https://raw.githubusercontent.com/MaximumADHD/Roblox-Client-Tracker/roblox/API-Dump.json

echo "── 1. compile every module ──"
node check.mjs ../src/shared/*.luau ../src/server/*.luau ../src/client/*.luau

echo "── 2. Roblox API validation ──"
python3 apicheck.py ../src/shared/*.luau ../src/server/*.luau ../src/client/*.luau
python3 apicheck_tables.py

echo "── 3. economy correctness ──"
node sim.mjs ../src/shared tests.luau

echo "── 4. integration: boot the real server and play it ──"
node integration.mjs .. integration.luau

echo "── 5. client: boot the real UI and click it ──"
node integration.mjs .. client_test.luau

echo "── 6. roll + world + ascension ──"
node integration.mjs .. roll_test.luau

echo "── 7. tutorial: walk a new player through the first run ──"
node integration.mjs .. tutorial_test.luau

echo "── 8. mobile: every panel on 5 real device sizes ──"
node integration.mjs .. mobile_test.luau

echo "── 9. adversarial: attack it ──"
node integration.mjs .. adversarial.luau

echo "── 10. balance sweeps"
node sim.mjs ../src/shared move.luau
node sim.mjs ../src/shared fmt.luau
echo "── 11. economy sweeps ──"
node sim.mjs ../src/shared snack.luau
node sim.mjs ../src/shared egg.luau

echo
echo "ALL SUITES PASSED"
