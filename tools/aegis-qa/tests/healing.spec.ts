import { expect, test } from '@playwright/test';
import { HealingPage } from '../src/healer.js';
import { PatchWriter } from '../src/patch-writer.js';

test('fills the practice form and heals username to name', async ({ page }) => {
  const patches = new PatchWriter();
  await page.goto('https://testautomationpractice.blogspot.com/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  const aegis = new HealingPage(page, { patchWriter: patches });

  // Deliberately stale locator: the page uses id="name", not id="username".
  await aegis.locator('#username').fill('Name');
  await page.waitForTimeout(1000); // Wait for the healing agent to process the broken locator.
  await aegis.locator('#email').fill('Name@example.com');
  await aegis.locator('#phone').fill('9876543210');

  await expect(page.locator('#name')).toHaveValue('Name');
  await expect(page.locator('#email')).toHaveValue('Name@example.com');
  await expect(page.locator('#phone')).toHaveValue('1234567890');
  expect(patches.getEvents()[0]).toMatchObject({ original: '#username', healed: '#name' });
  expect(patches.getEvents()[0].score).toBeGreaterThan(0.95);
});