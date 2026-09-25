import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { DEMO_SPECS } from '../src/zen/scenarios.js';

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/home/marco/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
  headless: true, args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(process.env.DEMO_URL || 'http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.getByRole('heading', { name: /Scegli una spec/ }).waitFor();
assert.equal(await page.locator('[data-spec]').count(), 2);
assert.equal(await page.locator('.step[data-status=working]').count(), 0);
await page.screenshot({ path: '/tmp/specops-catalog-desktop.png' });

for (const [specIndex, spec] of DEMO_SPECS.entries()) {
  await page.locator(`[data-spec="${spec.id}"]`).click();
  assert.equal(await page.locator('.project').innerText(), spec.filename);
  assert.equal(await page.locator('.step').count(), 8);
  assert.equal(await page.locator('.step-no').nth(1).innerText(), '1a');
  await page.waitForTimeout(300);
  if (specIndex === 1) await page.screenshot({ path: '/tmp/specops-dev-sidebar.png' });
  // Visit each real scenario, including a conflict and a genuinely unspecified choice.
  for (const [i, q] of spec.questions.entries()) {
    assert.equal(await page.locator('#case-counter').innerText(), `${String(i + 1).padStart(2, '0')} / 06`);
    if (i === 0) {
      const conflict = q.choices.findIndex(c => c.assessment === 'conflict');
      await page.locator(`[data-action="answer-${conflict}"]`).click();
      assert.equal(await page.locator('#demo').getAttribute('data-scene'), 'conflict');
      assert.match(await page.locator('.rule').innerText(), new RegExp(spec.rules[q.ruleIndex].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      await page.getByRole('button', { name: 'Metti in pausa', exact: true }).click();
      assert.equal(await page.locator('.step[data-status=paused]').count(), 1);
      await page.getByRole('button', { name: 'Resta nella spec e riprendi', exact: true }).click();
    } else if (q.ruleIndex === null) {
      await page.locator('[data-action="answer-0"]').click();
      assert.equal(await page.locator('#demo').getAttribute('data-scene'), 'unspecified');
      assert.equal(await page.getByRole('button', { name: 'Metti in pausa', exact: true }).count(), 0);
      await page.getByRole('button', { name: 'Registra la proposta' }).click();
    } else {
      const aligned = q.choices.findIndex(c => c.assessment === 'aligned');
      await page.locator(`[data-action="answer-${aligned}"]`).click();
    }
  }
  await page.getByRole('button', { name: 'Esplora l’altra spec' }).waitFor();
  assert.equal(await page.locator('.step[data-status=done]').count(), 8);
  await page.getByRole('button', { name: 'Rileggi spec e decisioni' }).click();
  assert.equal(await page.locator('.spec-rules li').count(), 5);
  assert.equal(await page.locator('#session-decisions li').count(), 1);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Esplora l’altra spec' }).click();
}

await page.locator('[data-spec="meeting-rooms"]').click();
assert.equal(await page.locator('#demo').getAttribute('data-scene'), 'complete', 'Session resumes independently');
await page.getByRole('button', { name: 'Cambia spec', exact: true }).click();
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/specops-catalog-mobile.png', fullPage: true });
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
await page.locator('[data-spec="shop-checkout"]').click();
await page.getByRole('button', { name: 'Ricomincia questa missione' }).click();
await page.screenshot({ path: '/tmp/specops-dev-sidebar-mobile.png', fullPage: true });
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
assert.deepEqual(errors, []);
console.log('PASS: selection, 12 scenarios, 2 conflicts and pauses, 2 unspecified decisions, rule evidence, isolated sessions, developer step IDs, desktop/mobile.');
await browser.close();
