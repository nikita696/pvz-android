import { expect, test } from '@playwright/test';
import { Buffer } from 'node:buffer';

import type { ApiAction, AppState } from '../src/domain/types';

const LOCATION = '\u041e\u0441\u043d\u043e\u0432\u043d\u043e\u0439 \u043f\u0443\u043d\u043a\u0442';
const UPDATED_LOCATION = '\u041f\u0412\u0417 \u043d\u0430 \u041b\u0435\u0441\u043d\u043e\u0439';
const ANNA = '\u0410\u043d\u043d\u0430';
const IRA = '\u0418\u0440\u0430';
const OWNER = '\u0412\u043b\u0430\u0434\u0435\u043b\u0435\u0446';
const RUBLE = '\u20bd';
const VISIBLE_DATE = '2026-05-31';
const DAY_NOTE = '\u0437\u0430\u043c\u0435\u043d\u0430';
const TOKEN_KEY = 'pvz.workspaceToken';
const TEST_TOKEN = 'test-token';
const INVITE_TOKEN = 'invite-token';
const NICK = '\u041d\u0438\u043a';
const ONBOARDING_TITLE = '\u041f\u043e\u0434\u043a\u043b\u044e\u0447\u0438\u0442\u0435 \u041f\u0412\u0417';
const ONBOARDING_SUBTITLE =
  '\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043a\u043e\u0434 \u043a\u043e\u043c\u0430\u043d\u0434\u044b, \u0447\u0442\u043e\u0431\u044b \u043e\u0442\u043a\u0440\u044b\u0442\u044c \u043e\u0431\u0449\u0438\u0439 \u0433\u0440\u0430\u0444\u0438\u043a \u0441\u043c\u0435\u043d \u0438 \u0432\u044b\u043f\u043b\u0430\u0442.';
const INVITE_CODE_LABEL = '\u041a\u043e\u0434 \u043a\u043e\u043c\u0430\u043d\u0434\u044b';
const INVITE_CODE_PLACEHOLDER = '\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043a\u043e\u0434';
const INVITE_CODE_HINT =
  '\u041a\u043e\u0434 \u043c\u043e\u0436\u043d\u043e \u043f\u043e\u043b\u0443\u0447\u0438\u0442\u044c \u0443 \u0440\u0443\u043a\u043e\u0432\u043e\u0434\u0438\u0442\u0435\u043b\u044f \u041f\u0412\u0417.';
const CONNECT_BUTTON = '\u041f\u043e\u0434\u043a\u043b\u044e\u0447\u0438\u0442\u044c\u0441\u044f';
const EMPTY_CODE_ERROR = '\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043a\u043e\u0434 \u043a\u043e\u043c\u0430\u043d\u0434\u044b.';
const INVALID_CODE_ERROR =
  '\u041a\u043e\u0434 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d \u0438\u043b\u0438 \u0431\u043e\u043b\u044c\u0448\u0435 \u043d\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0443\u0435\u0442.';
const NETWORK_ERROR =
  '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0438\u0442\u044c\u0441\u044f. \u041f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 \u0438\u043d\u0442\u0435\u0440\u043d\u0435\u0442 \u0438 \u043f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437.';
const INTERNAL_ONBOARDING_COPY = [
  NICK,
  '\u043a\u043e\u043c\u0430\u043d\u0434\u044b \u041d\u0438\u043a\u0430',
  '\u0447\u0443\u0436\u0438\u0445 \u0441\u043c\u0435\u043d',
  '\u0440\u0430\u0431\u043e\u0447\u0438\u0439 \u041f\u0412\u0417',
  '\u043f\u0443\u0441\u0442\u043e\u0439 \u041f\u0412\u0417',
];

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
  await expect(page.getByText(ONBOARDING_TITLE)).toBeVisible();

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
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#a8d5ba');
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/pwa-icon-192.png');

  const serviceWorkerResponse = await request.get('/sw.js');
  expect(serviceWorkerResponse.ok()).toBe(true);
  const serviceWorker = await serviceWorkerResponse.text();
  expect(serviceWorker).toContain("const CACHE_NAME = 'pvz-android-shell-v3'");
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

  await expect(page.getByText(ONBOARDING_TITLE)).toBeVisible();
  await expect(page.getByText(ONBOARDING_SUBTITLE)).toBeVisible();
  await expect(page.getByText(INVITE_CODE_LABEL, { exact: true })).toBeVisible();
  await expect(page.getByText(INVITE_CODE_HINT)).toBeVisible();
  await expect(page.getByTestId('invite-code-input')).toBeVisible();
  await expect(page.getByTestId('invite-code-input')).toHaveAttribute('placeholder', INVITE_CODE_PLACEHOLDER);
  await expect(page.getByText(CONNECT_BUTTON, { exact: true })).toBeVisible();
  await expect(page.getByTestId('create-workspace')).toHaveCount(0);
  for (const internalCopy of INTERNAL_ONBOARDING_COPY) {
    await expect(page.getByText(internalCopy)).toHaveCount(0);
  }
  expect(stateRequested).toBe(false);
});

test('invite onboarding shows neutral validation errors', async ({ page }) => {
  let inviteRequested = false;

  await page.route('**/api/invites/claim', async (route) => {
    inviteRequested = true;
    await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'INVALID_INVITE_CODE' }) });
  });

  await page.goto('/');
  await page.getByTestId('claim-invite-code').click();
  await expect(page.getByText(EMPTY_CODE_ERROR)).toBeVisible();
  expect(inviteRequested).toBe(false);

  await page.getByTestId('invite-code-input').fill('PVZ-WRONG');
  await page.getByTestId('claim-invite-code').click();
  await expect(page.getByText(INVALID_CODE_ERROR)).toBeVisible();
});

test('invite onboarding shows a neutral network error', async ({ page }) => {
  await page.route('**/api/invites/claim', async (route) => {
    await route.abort('failed');
  });

  await page.goto('/');
  await page.getByTestId('invite-code-input').fill('PVZ-CODE');
  await page.getByTestId('claim-invite-code').click();

  await expect(page.getByText(NETWORK_ERROR)).toBeVisible();
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

  let finishInviteRequest!: () => void;
  const inviteRequestCanFinish = new Promise<void>((resolve) => {
    finishInviteRequest = resolve;
  });

  await page.route('**/api/invites/claim', async (route) => {
    expect(JSON.parse(route.request().postData() ?? '{}')).toEqual({ code: 'PVZ-CODE' });
    await inviteRequestCanFinish;
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
  await expect(page.getByText('Сохраняю', { exact: true })).toBeVisible();
  finishInviteRequest();

  await expect(page.getByText(LOCATION)).toBeVisible();
  await page.getByTestId('open-employees').click();
  await expect(page.getByTestId(`archive-employee-${NICK}`)).toBeVisible();
  await page.reload();
  await expect(page.getByText(LOCATION)).toBeVisible();
  await page.getByTestId('open-employees').click();
  await expect(page.getByTestId(`archive-employee-${NICK}`)).toBeVisible();
});

test('minimal schedule and salary flow renders', async ({ page }) => {
  test.slow();
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
  let deletionUndo: {
    token: string;
    employee: AppState['employees'][number];
    shifts: AppState['shifts'];
    payments: AppState['payments'];
  } | null = null;
  let paymentDeletionUndo: {
    token: string;
    payment: AppState['payments'][number];
  } | null = null;
  let addPaymentRequestCount = 0;

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
      const employeeId = `emp-${serverState.employees.length + 1}`;
      serverState = {
        ...serverState,
        employees: [
          ...serverState.employees,
          {
            id: employeeId,
            name: action.name,
            dailyRate: action.dailyRate,
            color: '#f0dd92',
            active: true,
            createdAt: '2026-05-31T00:00:00.000Z',
          },
        ],
        shifts: action.name === IRA
          ? [...serverState.shifts, { id: 'shift-2', employeeId, date: VISIBLE_DATE }]
          : serverState.shifts,
      };
    }

    if (action.action === 'addPayment') {
      addPaymentRequestCount += 1;
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
      const payment = serverState.payments.find(
        (candidate) => candidate.id === action.id && candidate.employeeId === action.employeeId,
      );

      if (payment && action.undoToken) {
        paymentDeletionUndo = { token: action.undoToken, payment };
      }

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
      const employee = serverState.employees.find(
        (candidate) => candidate.id === action.employeeId && !candidate.active,
      );

      if (employee && action.undoToken) {
        deletionUndo = {
          token: action.undoToken,
          employee,
          shifts: serverState.shifts.filter((shift) => shift.employeeId === action.employeeId),
          payments: serverState.payments.filter((payment) => payment.employeeId === action.employeeId),
        };
      }

      serverState = {
        ...serverState,
        employees: serverState.employees.filter(
          (employee) => employee.id !== action.employeeId || employee.active,
        ),
        shifts: serverState.shifts.filter((shift) => shift.employeeId !== action.employeeId),
        payments: serverState.payments.filter((payment) => payment.employeeId !== action.employeeId),
      };
    }

    if (
      action.action === 'restoreDeletedPayment' &&
      paymentDeletionUndo?.token === action.undoToken
    ) {
      serverState = {
        ...serverState,
        payments: [...serverState.payments, paymentDeletionUndo.payment],
      };
      paymentDeletionUndo = null;
    }

    if (action.action === 'restoreDeletedEmployee' && deletionUndo?.token === action.undoToken) {
      serverState = {
        ...serverState,
        employees: [...serverState.employees, deletionUndo.employee],
        shifts: [...serverState.shifts, ...deletionUndo.shifts],
        payments: [...serverState.payments, ...deletionUndo.payments],
      };
      deletionUndo = null;
    }

    if (action.action === 'updateLocation') {
      serverState = {
        ...serverState,
        location: { ...serverState.location, name: action.name },
      };
    }

    if (action.action === 'updateEmployeeColor') {
      serverState = {
        ...serverState,
        employees: serverState.employees.map((employee) =>
          employee.id === action.employeeId ? { ...employee, color: action.color } : employee,
        ),
      };
    }

    if (action.action === 'importState') {
      serverState = action.state;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(serverState),
    });
  });

  await page.goto('/');

  await expect(page.getByText(LOCATION)).toBeVisible();
  await expect(page.getByTestId('sync-status')).toContainText('Данные синхронизированы');
  await expect(page.getByText('\u041c\u0430\u0439 2026')).toBeVisible();
  await expect(page.getByText('\u0423\u0434\u043e\u0431\u043d\u044b\u0439 \u0442\u0440\u0435\u043a\u0435\u0440 \u0441\u043c\u0435\u043d \u0438 \u0432\u044b\u043f\u043b\u0430\u0442')).toHaveCount(0);
  await expect(page.getByTestId('day-31').getByText('\u0410', { exact: true })).toBeVisible();
  const calendarBox = await page.getByTestId('calendar-grid').boundingBox();
  const shiftDayBox = await page.getByTestId('day-31').boundingBox();
  const shiftAvatarBox = await page.getByTestId('day-31').getByLabel(`Сотрудник ${ANNA}`).boundingBox();
  const initialViewport = page.viewportSize();
  expect(calendarBox).not.toBeNull();
  expect(shiftDayBox).not.toBeNull();
  expect(shiftAvatarBox).not.toBeNull();
  expect(initialViewport).not.toBeNull();
  expect(calendarBox!.x).toBeGreaterThanOrEqual(0);
  expect(calendarBox!.x + calendarBox!.width).toBeLessThanOrEqual(initialViewport!.width);
  expect(shiftDayBox!.height).toBeGreaterThanOrEqual(50);
  expect(shiftAvatarBox!.y + shiftAvatarBox!.height).toBeLessThanOrEqual(
    shiftDayBox!.y + shiftDayBox!.height,
  );
  await expect(page.getByText(`2 000 ${RUBLE}`).first()).toBeVisible();
  await expect(page.getByTestId('toggle-selected-day-employees')).toBeVisible();

  await expect(page.getByText('31.05.2026', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: '\u041f\u0440\u0435\u0434\u044b\u0434\u0443\u0449\u0438\u0439 \u043c\u0435\u0441\u044f\u0446' }).click();
  await expect(page.getByText('\u0410\u043f\u0440\u0435\u043b\u044c 2026', { exact: true })).toBeVisible();
  await expect(page.getByText('01.04.2026', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '\u0421\u043b\u0435\u0434\u0443\u044e\u0449\u0438\u0439 \u043c\u0435\u0441\u044f\u0446' }).click();
  await expect(page.getByText('\u041c\u0430\u0439 2026', { exact: true })).toBeVisible();
  await expect(page.getByText('31.05.2026', { exact: true }).first()).toBeVisible();

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
  await expect(page.getByTestId('day-note-31')).toBeVisible();
  await page.getByTestId('day-31').hover();
  const dayTooltip = page.getByTestId('day-tooltip-31');
  await expect(dayTooltip).toContainText(`Комментарий: ${DAY_NOTE}`);
  const tooltipBox = await dayTooltip.boundingBox();
  const viewport = page.viewportSize();
  expect(tooltipBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(tooltipBox!.x).toBeGreaterThanOrEqual(0);
  expect(tooltipBox!.x + tooltipBox!.width).toBeLessThanOrEqual(viewport!.width);
  await page.getByTestId('day-31').click();
  await expect(page.getByTestId('open-day-note').getByText(DAY_NOTE, { exact: true })).toBeVisible();
  await page.getByTestId('close-assignment').click();

  await page.getByTestId('open-location-editor').click();
  await page.getByTestId('location-name').fill(UPDATED_LOCATION);
  await page.getByTestId('save-location').click();

  await expect(page.getByText(UPDATED_LOCATION)).toBeVisible();

  await page.getByTestId('open-payment').click();
  await page.getByTestId('payment-amount').fill('300');
  await page.getByTestId('save-payment').click();
  await expect(page.getByText('\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u0430.')).toBeVisible();
  await page.getByTestId(`payment-employee-${ANNA}`).click();
  await page.getByTestId('payment-kind-deduction').click();
  await page.getByTestId('payment-date').fill('30.05.2026');
  await page.getByTestId('payment-comment').fill('\u0448\u0442\u0440\u0430\u0444');
  await page.getByTestId('save-payment').dblclick();

  await expect.poll(() => addPaymentRequestCount).toBe(1);
  await expect(page.getByText(`1 700 ${RUBLE}`).first()).toBeVisible();
  await expect(page.getByText(`\u0423\u0434\u0435\u0440\u0436\u0430\u043d\u043e 300 ${RUBLE}`)).toBeVisible();

  await page.getByTestId(`open-payment-history-${ANNA}`).click();
  await expect(page.getByText('\u041c\u0430\u0439 2026 \u0433.')).toBeVisible();
  await expect(page.getByText('30.05.2026')).toBeVisible();
  await expect(page.getByText('\u0448\u0442\u0440\u0430\u0444', { exact: true })).toBeVisible();
  await page.getByTestId('edit-payment-pay-new').click();
  await page.getByTestId('edit-payment-date').fill('29.05.2026');
  await page.getByTestId('edit-payment-amount').fill('0');
  await page.getByTestId('save-edit-payment').click();
  await expect(page.getByText('Укажи положительную сумму целыми рублями.', { exact: true })).toBeVisible();
  await page.getByTestId('edit-payment-amount').fill('200');
  await page.getByTestId('edit-payment-comment').fill('\u0448\u0442\u0440\u0430\u0444 \u0438\u0441\u043f\u0440.');
  await page.getByTestId('save-edit-payment').click();

  await expect(page.getByText('29.05.2026')).toBeVisible();
  await expect(page.getByText('\u0448\u0442\u0440\u0430\u0444 \u0438\u0441\u043f\u0440.')).toBeVisible();
  await page.getByTestId('delete-payment-pay-new').click();
  await page.getByTestId('confirm-delete-payment').click();

  await expect(page.getByTestId('payment-undo-banner')).toContainText('Запись на 200 ₽ удалена · 30 с');
  await expect(page.getByText(`2 000 ${RUBLE}`).first()).toBeVisible();
  await page.getByTestId('undo-delete-payment').click();
  await expect(page.getByTestId('payment-undo-banner')).toContainText('Запись на 200 ₽ возвращена');
  await expect(page.getByText(`1 800 ${RUBLE}`).first()).toBeVisible();

  await page.getByTestId(`open-payment-history-${ANNA}`).click();
  await page.getByTestId('delete-payment-pay-new').click();
  await page.getByTestId('confirm-delete-payment').click();

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
  await expect(page.getByText(`Для владельца ПВЗ можно указать 0 ${RUBLE}.`, { exact: true })).toBeVisible();
  await page.getByTestId('employee-name').fill(OWNER);
  await page.getByTestId('employee-rate').fill('0');
  await page.getByTestId('save-employee').click();
  await expect.poll(() => serverState.employees.find((employee) => employee.name === OWNER)?.dailyRate).toBe(0);
  await expect(page.getByText(OWNER).first()).toBeVisible();

  await page.getByTestId('open-employees').click();
  await page.getByTestId(`archive-employee-${IRA}`).click();
  await page.getByTestId(`delete-archived-employee-${IRA}`).click();
  await expect(page.getByText('Смен: 1', { exact: true })).toBeVisible();
  await expect(page.getByText('Выплат и удержаний: 0', { exact: true })).toBeVisible();
  await expect(page.getByTestId('confirm-delete-employee')).toHaveAttribute('aria-disabled', 'true');
  await page.getByTestId('delete-employee-confirmation').fill(IRA);
  await expect(page.getByTestId('confirm-delete-employee')).not.toHaveAttribute('aria-disabled', 'true');
  await page.getByTestId('confirm-delete-employee').click();

  await expect.poll(() => serverState.employees.some((employee) => employee.name === IRA)).toBe(false);
  await expect(page.getByTestId('employee-undo-banner')).toContainText(`${IRA} удалён · 30 с`);
  await page.getByTestId('undo-delete-employee').click();
  await expect.poll(() => serverState.employees.some((employee) => employee.name === IRA)).toBe(true);
  await expect(page.getByTestId('employee-undo-banner')).toContainText(`${IRA} возвращён`);
  await page.getByTestId('open-employees').click();
  await expect(page.getByTestId(`delete-archived-employee-${IRA}`)).toBeVisible();
  await page.getByTestId('close-employees').click();
  await expect(page.getByText(`2 000 ${RUBLE}`).first()).toBeVisible();
  await expect(page.getByText('\u0421\u043e\u0445\u0440\u0430\u043d\u044f\u044e', { exact: true })).toHaveCount(0);

  await page.context().setOffline(true);
  await expect(page.getByTestId('sync-status')).toContainText('Нет сети');
  await page.context().setOffline(false);
  await expect(page.getByTestId('sync-status')).toContainText('Данные синхронизированы');

  await page.getByTestId('open-settings').click();
  await expect(page.getByText('\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438', { exact: true })).toBeVisible();
  await expect(page.getByTestId(/^employee-color-emp-1-/)).toHaveCount(7);
  await page.getByTestId('employee-color-emp-1-#0e7490').click();
  await expect.poll(() => serverState.employees.find((employee) => employee.id === 'emp-1')?.color).toBe('#0e7490');
  await expect(page.getByText('\u0421\u043e\u0445\u0440\u0430\u043d\u044f\u044e', { exact: true })).toHaveCount(0);

  await page.evaluate(() => {
    const originalCreateObjectUrl = URL.createObjectURL.bind(URL);
    const originalClick = HTMLAnchorElement.prototype.click;
    const testWindow = window as typeof window & {
      __pvzBackupDownload?: { fileName: string; contents: string };
    };

    URL.createObjectURL = (blob: Blob) => {
      void blob.text().then((contents) => {
        testWindow.__pvzBackupDownload = {
          fileName: testWindow.__pvzBackupDownload?.fileName ?? '',
          contents,
        };
      });
      return originalCreateObjectUrl(blob);
    };
    HTMLAnchorElement.prototype.click = function click() {
      testWindow.__pvzBackupDownload = {
        fileName: this.download,
        contents: testWindow.__pvzBackupDownload?.contents ?? '',
      };
      originalClick.call(this);
    };
  });
  await page.getByTestId('export-backup').click();
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __pvzBackupDownload?: { contents: string } }
  ).__pvzBackupDownload?.contents.length ?? 0)).toBeGreaterThan(0);
  const capturedDownload = await page.evaluate(() => (
    window as typeof window & { __pvzBackupDownload: { fileName: string; contents: string } }
  ).__pvzBackupDownload);
  expect(capturedDownload.fileName).toMatch(/^pvz-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const exported = JSON.parse(capturedDownload.contents) as { format: string; state: AppState };
  expect(exported.format).toBe('pvz-android-backup');
  expect(exported.state.location.name).toBe(UPDATED_LOCATION);

  const importedState: AppState = {
    ...serverState,
    location: { id: 'main', name: '\u041f\u0412\u0417 \u0438\u0437 \u043a\u043e\u043f\u0438\u0438' },
  };
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByTestId('import-backup').click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'pvz-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      format: 'pvz-android-backup',
      version: 1,
      exportedAt: '2026-06-01T10:30:00.000Z',
      state: importedState,
    })),
  });
  await expect(page.getByText('\u0412\u043e\u0441\u0441\u0442\u0430\u043d\u043e\u0432\u0438\u0442\u044c \u043a\u043e\u043f\u0438\u044e?')).toBeVisible();
  await page.getByTestId('confirm-import-backup').click();
  await expect(page.getByText('\u0420\u0435\u0437\u0435\u0440\u0432\u043d\u0430\u044f \u043a\u043e\u043f\u0438\u044f \u0432\u043e\u0441\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d\u0430. \u041f\u0440\u0435\u0434\u044b\u0434\u0443\u0449\u0435\u0435 \u0441\u043e\u0441\u0442\u043e\u044f\u043d\u0438\u0435 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u043e \u0432 Neon.')).toBeVisible();
  expect(serverState.location.name).toBe('\u041f\u0412\u0417 \u0438\u0437 \u043a\u043e\u043f\u0438\u0438');
});
