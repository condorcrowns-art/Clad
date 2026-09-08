/* Render the app icons.
 *
 * Chrome on Android will not offer "Add to Home Screen" for a manifest whose
 * only icon is an inline SVG, which is exactly the case Parla shipped with —
 * so the one platform this is meant to be installed on was the one that would
 * not install it. This renders real PNGs at the two sizes Android looks for.
 *
 *   node tools/make-icons.js
 */
const { chromium } = require('playwright');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// The fiesta palette, on the marigold-to-rosa sweep the app opens with.
const svg = (size) => `
<html><body style="margin:0">
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#e8a33d"/>
      <stop offset="55%" stop-color="#d4553c"/>
      <stop offset="100%" stop-color="#b8336a"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#g)"/>
  <g fill="none" stroke="#ffffff" stroke-opacity=".22" stroke-width="10">
    <path d="M0 96 L512 96 M0 416 L512 416"/>
  </g>
  <text x="256" y="356" font-size="272" text-anchor="middle">🗣️</text>
</svg>
</body></html>`;

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage();
  for (const size of [192, 512]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(svg(size));
    await page.screenshot({ path: path.join(ROOT, 'icon-' + size + '.png'), omitBackground: false });
    console.log('icon-' + size + '.png');
  }
  await browser.close();
})();
