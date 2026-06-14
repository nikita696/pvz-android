import { expect, test, type Page } from '@playwright/test';

const LOCATION = '\u041e\u0441\u043d\u043e\u0432\u043d\u043e\u0439 \u043f\u0443\u043d\u043a\u0442';
const UPDATED_LOCATION = '\u041f\u0412\u0417 \u043d\u0430 \u041b\u0435\u0441\u043d\u043e\u0439';
const NICK = '\u041d\u0438\u043a';
const RUBLE = '\u20bd';
const VISIBLE_DATE = '2026-05-31';

async function disableServiceWorker(page: Page) {
  await page.route('**/sw.js', async (route) => {
    await route.abort();
  });
}

async function failOnApiRequests(page: Page) {
  let apiRequests = 0;

  await page.route('**/api/**', async (route) => {
    apiRequests += 1;
    await route.abort();
  });

  return () => apiRequests;
}

async function freezeDate(page: Page) {
  await page.addInitScript((visibleDate) => {
    const fixedNow = `${visibleDate}T12:00:00.000Z`;
    const RealDate = Date;

    class MockDate extends RealDate {
      constructor(...args: ConstructorParameters<typeof Date>) {
        super(...(args.length ? args : [fixedNow]));
      }

      static now() {
        return new RealDate(fixedNow).getTime();
      }
    }

    window.Date = MockDate as DateConstructor;
  }, VISIBLE_DATE);
}

test('fresh install opens an empty local PVZ without server access', async ({ page }) => {
  await disableServiceWorker(page);
  const getApiRequestCount = await failOnApiRequests(page);

  await page.goto('/');

  await expect(page.getByText(LOCATION)).toBeVisible();
  await expect(page.getByTestId('employees-section-title')).toBeVisible();
  await expect(page.getByTestId('invite-code-input')).toHaveCount(0);
  await expect(page.getByTestId('claim-invite-code')).toHaveCount(0);
  await expect(page.getByTestId('create-workspace')).toHaveCount(0);
  await expect(page.getByTestId('workspace-invite-code')).toHaveCount(0);

  await page.getByTestId('open-employees').click();
  await expect(page.getByText('\u041f\u043e\u043a\u0430 \u043d\u0438\u043a\u043e\u0433\u043e \u043d\u0435\u0442.')).toBeVisible();
  expect(getApiRequestCount()).toBe(0);
});

test('manual local data persists after reload', async ({ page }) => {
  await disableServiceWorker(page);
  await freezeDate(page);
  const getApiRequestCount = await failOnApiRequests(page);

  await page.goto('/');
  await page.getByTestId('open-location-editor').click();
  await page.getByTestId('location-name').fill(UPDATED_LOCATION);
  await page.getByTestId('save-location').click();

  await page.getByTestId('open-employees').click();
  await page.getByTestId('employee-name').fill(NICK);
  await page.getByTestId('employee-rate').fill('2500');
  await page.getByTestId('save-employee').click();

  await expect(page.getByText(UPDATED_LOCATION)).toBeVisible();
  await expect(page.getByText(NICK).first()).toBeVisible();

  await page.getByTestId('day-31').click();
  await page.getByTestId(`assign-employee-${NICK}`).click();
  await expect(page.getByText(`2 500 ${RUBLE}`).first()).toBeVisible();

  await page.reload();

  await expect(page.getByText(UPDATED_LOCATION)).toBeVisible();
  await expect(page.getByText(NICK).first()).toBeVisible();
  await expect(page.getByText(`2 500 ${RUBLE}`).first()).toBeVisible();
  expect(getApiRequestCount()).toBe(0);
});

test('pwa install metadata and service worker are available', async ({ page, request }) => {
  await page.goto('/');

  const manifestResponse = await request.get('/manifest.json');
  expect(manifestResponse.ok()).toBe(true);
  await expect(manifestResponse.json()).resolves.toEqual({
    name: 'PVZ Android',
    short_name: 'PVZ',
    start_url: '/',
    display: 'standalone',
    background_color: '#f7f8f5',
    theme_color: '#a8d5ba',
    icons: [
      {
        src: '/pwa-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any maskable',
      },
      {
        src: '/pwa-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable',
      },
    ],
  });

  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.json');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#a8d5ba');
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/pwa-icon-192.png');

  const serviceWorkerResponse = await request.get('/sw.js');
  expect(serviceWorkerResponse.ok()).toBe(true);
  const serviceWorker = await serviceWorkerResponse.text();
  expect(serviceWorker).toContain("const CACHE_NAME = 'pvz-android-shell-v2'");
  expect(serviceWorker).toContain("request.mode === 'navigate'");
});
