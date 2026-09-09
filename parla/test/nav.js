/* Navigating the app the way a person does.
 *
 * Five tabs fit across a phone and there are nine screens, so the other four
 * live behind More. A test that clicks `#nav button[data-view=games]` is
 * testing a button that is not on the screen at that width — this goes through
 * whichever route is actually available, which is also the route a user takes.
 */
async function goTo(page, view) {
  const tab = page.locator('#nav button[data-view=' + view + ']');
  if (await tab.isVisible()) {
    await tab.click();
  } else {
    await page.locator('#navMore').click();
    await page.waitForTimeout(280);
    await page.locator('.sheet-item[data-view="' + view + '"], .sheet-item')
      .filter({ hasText: LABEL[view] }).first().click();
  }
  await page.waitForTimeout(450);
}

const LABEL = {
  home: 'Home', scenarios: 'Talk', coach: 'Ask', words: 'Words', review: 'Review',
  grammar: 'Grammar', games: 'Games', conjugate: 'Verbs', challenge: '60 days', progress: 'Stats',
  settings: 'Settings'
};

module.exports = { goTo, LABEL };
