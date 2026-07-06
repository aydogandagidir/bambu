import { chromium } from 'playwright-core';
import fs from 'fs';

(async () => {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('Navigating to setup...');
  await page.goto('http://localhost:5173');

  // Wait for the setup form
  await page.waitForSelector('form');
  console.log('Setup form found.');

  // Check the title and brand
  const title = await page.title();
  console.log('Page title:', title);

  const brandText = await page.textContent('h1');
  console.log('Page Header:', brandText);

  // Take a screenshot of the pre-setup state
  await page.screenshot({ path: 'presetup.png' });
  console.log('Saved presetup.png');

  // Fill in the form
  await page.fill('input[type="text"]', 'Bambu Demo Site');
  await page.fill('input[type="email"]', 'admin@bambu.local');
  await page.fill('input[type="password"]', 'Password123456!');
  
  console.log('Submitting setup form...');
  await page.click('button[type="submit"]');

  // Wait for navigation or next step
  await page.waitForTimeout(3000);
  
  console.log('Post-setup URL:', page.url());
  await page.screenshot({ path: 'postsetup.png' });
  console.log('Saved postsetup.png');

  await browser.close();
  console.log('Done!');
})();
