/* Minimal browser-ish sandbox so the app's plain <script> files can be
 * loaded and exercised from Node without a real DOM. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeSandbox() {
  const ctx = vm.createContext({ console, setTimeout, clearTimeout, Math, Date, JSON });
  vm.runInContext('var window = globalThis; var self = globalThis;', ctx);
  return ctx;
}

function load(ctx, ...files) {
  const root = path.join(__dirname, '..');
  for (const f of files) {
    const code = fs.readFileSync(path.join(root, f), 'utf8');
    vm.runInContext(code, ctx, { filename: f });
  }
  return ctx;
}

module.exports = { makeSandbox, load };
