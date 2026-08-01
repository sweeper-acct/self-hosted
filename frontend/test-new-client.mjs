import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const EMAIL = 'junior-a@staging.sweeper.test';
const PASSWORD = 'Test@Sweeper2026';

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 400 });
  const page = await browser.newPage();
  page.on('console', m => console.log('[browser]', m.text()));

  // Log every API request + whether it has Authorization header
  page.on('request', req => {
    if (req.url().includes('localhost:8000')) {
      const auth = req.headers()['authorization'];
      console.log(`[req] ${req.method()} ${req.url().replace('http://localhost:8000','')} auth=${auth ? auth.substring(0,30)+'...' : 'NONE'}`);
    }
  });
  page.on('response', res => {
    if (res.url().includes('localhost:8000')) {
      console.log(`[res] ${res.status()} ${res.url().replace('http://localhost:8000','')}`);
    }
  });

  console.log('→ Opening login page');
  await page.goto(`${BASE}/login`);
  await page.waitForSelector('input[type="email"]', { timeout: 8000 });

  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');

  console.log('→ Waiting for conversation page');
  await page.waitForURL('**/conversation', { timeout: 10000 });
  console.log('✓ Logged in');

  console.log('→ Navigating to Clients');
  await page.click('a[href="/clients"]');
  await page.waitForURL('**/clients', { timeout: 5000 });
  console.log('✓ Clients page loaded');
  await page.screenshot({ path: 'clients-list.png' });

  console.log('→ Clicking New Client');
  await page.click('button:has-text("New Client")');
  await page.waitForURL('**/clients/new', { timeout: 5000 });
  console.log('✓ New Client page loaded');
  await page.screenshot({ path: 'new-client-empty.png' });

  console.log('→ ABN Lookup (stub)');
  await page.fill('input[placeholder*="51"]', '51 123 456 789');
  await page.click('button:has-text("Lookup")');
  await page.waitForSelector('text=ALPHASON BUILDING SUPPLIES', { timeout: 6000 });
  console.log('✓ ABN stub result shown');
  await page.screenshot({ path: 'new-client-abn.png' });

  console.log('→ Filling industry');
  await page.fill('input[placeholder*="Cafe"]', 'Building & Construction');
  await page.screenshot({ path: 'new-client-filled.png' });

  console.log('→ Checking Register button enabled');
  const btn = page.locator('button:has-text("Register Client")');
  const disabled = await btn.isDisabled();
  console.log(disabled ? '✗ Button still disabled' : '✓ Register button enabled');

  await page.screenshot({ path: 'new-client-ready.png' });

  if (!disabled) {
    // Log what the POST body actually sends
    const postBody = await page.evaluate(() => {
      // Read abrData from React state isn't directly possible,
      // but we can intercept the next fetch
      return null;
    });

    // Intercept the actual POST to see what's being sent
    const postBodyCapture = new Promise(resolve => {
      page.route('**/api/v1/clients', async (route) => {
        if (route.request().method() === 'POST') {
          const body = route.request().postDataJSON();
          console.log(`[POST body] gst_registered=${body?.gst_registered} gst_from=${body?.gst_registered_from}`);
          resolve(body);
          await route.continue();
        } else {
          await route.continue();
        }
      });
    });

    console.log('→ Submitting — clicking Register Client');
    await btn.click();
    await postBodyCapture;
    // Wait for redirect back to /clients list
    await page.waitForURL('**/clients', { timeout: 8000 });
    console.log('✓ Redirected to Clients list');
    // Wait for the table to render (new client visible)
    await page.waitForSelector('text=ALPHASON BUILDING SUPPLIES PTY LTD', { timeout: 6000 });
    console.log('✓ New client visible in list');
    await page.screenshot({ path: 'clients-after-register.png' });

    // Verify new client row exists
    const rows = await page.locator('tbody tr').count();
    console.log(`✓ Client rows in table: ${rows}`);
  }

  await browser.close();
  console.log('Done — screenshots saved');
})();
