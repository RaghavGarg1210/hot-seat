import { chromium } from 'playwright';
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  recordVideo: { dir: 'test-results/demo', size: { width: 1440, height: 1000 } },
});
const page = await context.newPage();
await page.goto('http://127.0.0.1:3000');
await page.getByRole('button', { name: 'Watch a sample', exact: true }).click();
await page.getByRole('button', { name: 'Play replay', exact: true }).waitFor({ timeout: 25000 });
await page.getByRole('button', { name: 'See the debrief' }).click();
await page.getByRole('heading', { name: 'Interest is not a purchase commitment' }).waitFor();
await page.getByRole('button', { name: 'See the moment' }).first().click();
await page.screenshot({ path: 'docs/images/debrief.png', fullPage: true });
const video = page.video();
await context.close();
await video.saveAs('docs/demo.webm');
await browser.close();
console.log('Saved docs/demo.webm. This is a silent, scripted product walkthrough.');
