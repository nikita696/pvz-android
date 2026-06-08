import { expect, test } from '@playwright/test';

import type { ApiAction, AppState } from '../src/domain/types';

const LOCATION = '\u041e\u0441\u043d\u043e\u0432\u043d\u043e\u0439 \u043f\u0443\u043d\u043a\u0442';
const UPDATED_LOCATION = '\u041f\u0412\u0417 \u043d\u0430 \u041b\u0435\u0441\u043d\u043e\u0439';
const ANNA = '\u0410\u043d\u043d\u0430';
const IRA = '\u0418\u0440\u0430';
const RUBLE = '\u20bd';
const VISIBLE_DATE = '2026-05-31';
const DAY_NOTE = '\u0437\u0430\u043c\u0435\u043d\u0430';
const TOKEN_KEY = 'pvz.workspaceToken';
const TEST_TOKEN = 'test-token';
const EMPTY_TOKEN = 'empty-token';
const INVITE_TOKEN = 'invite-token';
const NICK = '\u041d\u0438\u043a';

test('pwa install metadata and service worker are available', async ({ page, request }) => {
  await page.route('**/api/state', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        location: { id: 'main', name: LOCATION },
        employees: [],
        shifts: [],
        payments: [],
        dayNotes: [],
      } satisfies AppState),
    });
  });

  await page.goto('/');
  await expect(page.getByTestId('create-workspace')).toBeVisible();

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

  const registration = await page.evaluate(async () => {
    const serviceWorker = navigator.serviceWorker;
    if (!serviceWorker) {
      return null;
    }

    const readyRegistration = await serviceWorker.ready;
    const worker = readyRegistration.active ?? readyRegistration.waiting ?? readyRegistration.installing;

    return {
      scope: readyRegistration.scope,
      scriptURL: worker?.scriptURL,
    };
  });

  expect(registration?.scope).toBe('http://127.0.0.1:8097/');
  expect(registration?.scriptURL).toBe('http://127.0.0.1:8097/sw.js');
});

test('fresh install starts with onboarding and no real workspace data', async ({ page }) => {
  let stateRequested = false;

  await page.route('**/api/state', async (route) => {
    stateRequested = true;
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'UNEXPECTED' }) });
  });

  await page.goto('/');

  await expect(page.getByTestId('invite-code-input')).toBeVisible();
  await expect(page.getByTestId('create-workspace')).toBeVisible();
  await expect(page.getByText(NICK, { exact: true })).toHaveCount(0);
  expect(stateRequested).toBe(false);
});

test('creating an empty workspace opens an isolated blank schedule', async ({ page }) => {
  let serverState: AppState = {
    location: { id: 'main', name: LOCATION },
    employees: [],
    shifts: [],
    payments: [],
    dayNotes: [],
  };

  await page.route('**/api/workspaces', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ token: EMPTY_TOKEN, state: serverState }),
    });
  });
  await page.route('**/api/state', async (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${EMPTY_TOKEN}`);
    const action = JSON.parse(route.request().postData() ?? '{}') as ApiAction;

    if (action.action === 'addEmployee') {
      serverState = {
        ...serverState,
        employees: [
          ...serverState.employees,
          {
            id: 'emp-empty',
            name: action.name,
            dailyRate: action.dailyRate,
            color: '#a8d5ba',
            active: true,
            createdAt: '2026-05-31T00:00:00.000Z',
          },
        ],
      };
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(serverState) });
  });

  await page.goto('/');
  await expect(page.getByTestId('create-workspace')).toBeVisible();
  await page.getByTestId('create-workspace').click();
  await expect(page.getByText(LOCATION)).toBeVisible();
  await expect(page.getByText(NICK, { exact: true })).toHaveCount(0);

  await page.getByTestId('open-employees').click();
  await page.getByTestId('employee-name').fill(IRA);
  await page.getByTestId('employee-rate').fill('3000');
  await page.getByTestId('save-employee').click();

  await expect(page.getByText(IRA).first()).toBeVisible();
});

test('invite code connects to the private PVZ workspace', async ({ page }) => {
  const nickState: AppState = {
    location: { id: 'main', name: LOCATION },
    employees: [
      {
        id: 'emp-nick',
        name: NICK,
        dailyRate: 2500,
        color: '#a8d5ba',
        active: true,
        createdAt: '2026-05-01T00:00:00.000Z',
      },
    ],
    shifts: [],
    payments: [],
    dayNotes: [],
  };

  await page.route('**/api/invites/claim', async (route) => {
    expect(JSON.parse(route.request().postData() ?? '{}')).toEqual({ code: 'PVZ-CODE' });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ token: INVITE_TOKEN, state: nickState }),
    });
  });
  await page.route('**/api/state', async (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${INVITE_TOKEN}`);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(nickState) });
  });

  await page.goto('/');
  await expect(page.getByTestId('invite-code-input')).toBeVisible();
  await page.getByTestId('invite-code-input').fill('PVZ-CODE');
  await expect(page.getByTestId('invite-code-input')).toHaveValue('PVZ-CODE');
  await page.getByTestId('claim-invite-code').click();

  await expect(page.getByText(LOCATION)).toBeVisible();
  await page.getByTestId('open-employees').click();
  await expect(page.getByTestId(`archive-employee-${NICK}`)).toBeVisible();
  await page.reload();
  await expect(page.getByText(LOCATION)).toBeVisible();
  await page.getByTestId('open-employees').click();
  await expect(page.getByTestId(`archive-employee-${NICK}`)).toBeVisible();
});

test('minimal schedule and salary flow renders', async ({ page }) => {
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
  await page.addInitScript(
    ({ key, token }) => {
      window.localStorage.setItem(key, token);
    },
    { key: TOKEN_KEY, token: TEST_TOKEN },
  );

  let serverState: AppState = {
    location: { id: 'main', name: LOCATION },
    employees: [
      {
        id: 'emp-1',
        name: ANNA,
        dailyRate: 2500,
        color: '#a8d5ba',
        active: true,
        createdAt: '2026-05-01T00:00:00.000Z',
      },
    ],
    shifts: [{ id: 'shift-1', employeeId: 'emp-1', date: VISIBLE_DATE }],
    payments: [
      {
        id: 'pay-1',
        employeeId: 'emp-1',
        amount: 500,
        paidAt: VISIBLE_DATE,
        kind: 'payment',
        comment: '\u0430\u0432\u0430\u043d\u0441',
      },
    ],
    dayNotes: [],
  };

  await page.route('**/api/state', async (route) => {
    const request = route.request();
    expect(request.headers().authorization).toBe(`Bearer ${TEST_TOKEN}`);

    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(serverState),
      });
      return;
    }

    const action = JSON.parse(request.postData() ?? '{}') as ApiAction;

    if (action.action === 'addEmployee') {
      serverState = {
        ...serverState,
        employees: [
          ...serverState.employees,
          {
            id: 'emp-2',
            name: action.name,
            dailyRate: action.dailyRate,
            color: '#f0dd92',
            active: true,
            createdAt: '2026-05-31T00:00:00.000Z',
          },
        ],
        shifts: [...serverState.shifts, { id: 'shift-2', employeeId: 'emp-2', date: VISIBLE_DATE }],
      };
    }

    if (action.action === 'addPayment') {
      serverState = {
        ...serverState,
        payments: [
          ...serverState.payments,
          {
            id: 'pay-new',
            employeeId: action.employeeId,
            amount: action.amount,
            paidAt: action.paidAt,
            kind: action.kind ?? 'payment',
            comment: action.comment ?? '',
          },
        ],
      };
    }

    if (action.action === 'saveDayNote') {
      const comment = action.comment.trim();
      serverState = {
        ...serverState,
        dayNotes: comment
          ? [
              ...serverState.dayNotes.filter((note) => note.date !== action.date),
              {
                date: action.date,
                comment,
                updatedAt: '2026-05-31T12:00:00.000Z',
              },
            ]
          : serverState.dayNotes.filter((note) => note.date !== action.date),
      };
    }

    if (action.action === 'updatePayment') {
      serverState = {
        ...serverState,
        payments: serverState.payments.map((payment) =>
          payment.id === action.id && payment.employeeId === action.employeeId
            ? {
                ...payment,
                amount: action.amount,
                paidAt: action.paidAt,
                kind: action.kind ?? 'payment',
                comment: action.comment ?? '',
              }
            : payment,
        ),
      };
    }

    if (action.action === 'deletePayment') {
      serverState = {
        ...serverState,
        payments: serverState.payments.filter(
          (payment) => payment.id !== action.id || payment.employeeId !== action.employeeId,
        ),
      };
    }

    if (action.action === 'archiveEmployee') {
      serverState = {
        ...serverState,
        employees: serverState.employees.map((employee) =>
          employee.id === action.employeeId ? { ...employee, active: false } : employee,
        ),
      };
    }

    if (action.action === 'deleteEmployee') {
      serverState = {
        ...serverState,
        employees: serverState.employees.filter(
          (employee) => employee.id !== action.employeeId || employee.active,
        ),
      };
    }

    if (action.action === 'updateLocation') {
      serverState = {
        ...serverState,
        location: { ...serverState.location, name: action.name },
      };
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(serverState),
    });
  });

  await page.goto('/');

  await expect(page.getByText(LOCATION)).toBeVisible();
  await expect(page.getByText('\u043c\u0430\u0439 2026')).toBeVisible();
  await expect(page.getByText(`2 000 ${RUBLE}`).first()).toBeVisible();
  await expect(page.getByTestId('toggle-selected-day-employees')).toBeVisible();

  await page.getByTestId('toggle-selected-day-employees').click();
  await expect(page.getByTestId(`toggle-selected-day-employee-${ANNA}`)).toBeVisible();
  await page.getByTestId(`toggle-selected-day-employee-${ANNA}`).click();
  await expect(page.getByText('\u0421\u043c\u0435\u043d', { exact: true })).toBeVisible();
  await expect(page.getByText('\u0412 \u044d\u0442\u043e\u043c \u043c\u0435\u0441\u044f\u0446\u0435', { exact: true })).toBeVisible();
  await expect(page.getByText('1 \u0438\u0437 1', { exact: true })).toBeVisible();
  await expect(page.getByText('\u0417\u0430 \u0432\u0441\u0451 \u0432\u0440\u0435\u043c\u044f', { exact: true })).toBeVisible();
  await expect(page.getByText('1 \u0441\u043c\u0435\u043d\u0430', { exact: true })).toBeVisible();
  await expect(page.getByText('\u0422\u0440\u0443\u0434\u043e\u0443\u0441\u0442\u0440\u043e\u0439\u0441\u0442\u0432\u043e', { exact: true })).toBeVisible();
  await expect(page.getByText('31.05.2026', { exact: true }).first()).toBeVisible();

  await page.getByTestId('day-31').click();
  await expect(page.getByTestId('open-day-note')).toBeVisible();
  await expect(page.getByText('замена · опоздание · прогул · больничный')).toBeVisible();
  await page.getByTestId('open-day-note').click();
  await page.getByTestId('day-note-comment').fill(DAY_NOTE);
  await page.getByTestId('save-day-note').click();
  await page.getByTestId('day-31').click();
  await expect(page.getByTestId('open-day-note').getByText(DAY_NOTE, { exact: true })).toBeVisible();
  await page.getByTestId('close-assignment').click();

  await page.getByTestId('open-location-editor').click();
  await page.getByTestId('location-name').fill(UPDATED_LOCATION);
  await page.getByTestId('save-location').click();

  await expect(page.getByText(UPDATED_LOCATION)).toBeVisible();

  await page.getByTestId('open-payment').click();
  await page.getByTestId('payment-kind-deduction').click();
  await page.getByTestId('payment-date').fill('30.05.2026');
  await page.getByTestId('payment-amount').fill('300');
  await page.getByTestId('payment-comment').fill('\u0448\u0442\u0440\u0430\u0444');
  await page.getByTestId('save-payment').click();

  await expect(page.getByText(`1 700 ${RUBLE}`).first()).toBeVisible();
  await expect(page.getByText(`\u0423\u0434\u0435\u0440\u0436\u0430\u043d\u043e 300 ${RUBLE}`)).toBeVisible();

  await page.getByTestId(`open-payment-history-${ANNA}`).click();
  await expect(page.getByText('\u041c\u0430\u0439 2026 \u0433.')).toBeVisible();
  await expect(page.getByText('30.05.2026')).toBeVisible();
  await expect(page.getByText('\u0448\u0442\u0440\u0430\u0444', { exact: true })).toBeVisible();
  await page.getByTestId('edit-payment-pay-new').click();
  await page.getByTestId('edit-payment-date').fill('29.05.2026');
  await page.getByTestId('edit-payment-amount').fill('200');
  await page.getByTestId('edit-payment-comment').fill('\u0448\u0442\u0440\u0430\u0444 \u0438\u0441\u043f\u0440.');
  await page.getByTestId('save-edit-payment').click();

  await expect(page.getByText('29.05.2026')).toBeVisible();
  await expect(page.getByText('\u0448\u0442\u0440\u0430\u0444 \u0438\u0441\u043f\u0440.')).toBeVisible();
  await page.getByTestId('delete-payment-pay-new').click();
  await page.getByTestId('confirm-delete-payment').click();
  await page.getByTestId('close-payment-history').click();

  await expect(page.getByText(`2 000 ${RUBLE}`).first()).toBeVisible();

  await page.getByTestId('day-31').click();
  await expect(page.getByTestId(`assign-employee-${ANNA}`)).toBeVisible();
  await page.getByTestId('close-assignment').click();

  await page.getByTestId('open-employees').click();
  await page.getByTestId('employee-name').fill(IRA);
  await page.getByTestId('employee-rate').fill('3000');
  await page.getByTestId('save-employee').click();

  await expect(page.getByText(IRA).first()).toBeVisible();
  await expect(page.getByText(`5 000 ${RUBLE}`).first()).toBeVisible();

  await page.getByTestId('open-employees').click();
  await page.getByTestId(`archive-employee-${IRA}`).click();
  await page.getByTestId(`delete-archived-employee-${IRA}`).click();
  await page.getByTestId('confirm-delete-employee').click();

  await expect(page.getByText(IRA)).toHaveCount(0);
  await expect(page.getByText(`2 000 ${RUBLE}`).first()).toBeVisible();
});
