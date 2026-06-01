import { expect, test } from '@playwright/test';

import type { ApiAction, AppState } from '../src/domain/types';

const LOCATION = '\u041e\u0441\u043d\u043e\u0432\u043d\u043e\u0439 \u043f\u0443\u043d\u043a\u0442';
const UPDATED_LOCATION = '\u041f\u0412\u0417 \u043d\u0430 \u041b\u0435\u0441\u043d\u043e\u0439';
const ANNA = '\u0410\u043d\u043d\u0430';
const IRA = '\u0418\u0440\u0430';
const RUBLE = '\u20bd';
const VISIBLE_DATE = '2026-05-31';

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
  };

  await page.route('**/api/state', async (route) => {
    const request = route.request();

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
