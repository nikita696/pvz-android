import { expect, test } from '@playwright/test';

import type { ApiAction, AppState } from '../src/domain/types';

const LOCATION = '\u041e\u0441\u043d\u043e\u0432\u043d\u043e\u0439 \u043f\u0443\u043d\u043a\u0442';
const CALENDAR = '\u041a\u0430\u043b\u0435\u043d\u0434\u0430\u0440\u044c';
const ANNA = '\u0410\u043d\u043d\u0430';
const IRA = '\u0418\u0440\u0430';
const RUBLE = '\u20bd';

test('minimal schedule and salary flow renders', async ({ page }) => {
  let serverState: AppState = {
    location: { id: 'main', name: LOCATION },
    employees: [
      {
        id: 'emp-1',
        name: ANNA,
        dailyRate: 2500,
        active: true,
        createdAt: '2026-05-01T00:00:00.000Z',
      },
    ],
    shifts: [{ id: 'shift-1', employeeId: 'emp-1', date: '2026-05-31' }],
    payments: [{ id: 'pay-1', employeeId: 'emp-1', amount: 500, paidAt: '2026-05-31' }],
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
            active: true,
            createdAt: '2026-05-31T00:00:00.000Z',
          },
        ],
        shifts: [...serverState.shifts, { id: 'shift-2', employeeId: 'emp-2', date: '2026-05-31' }],
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

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(serverState),
    });
  });

  await page.goto('/');

  await expect(page.getByText(LOCATION)).toBeVisible();
  await expect(page.getByText(CALENDAR)).toBeVisible();
  await expect(page.getByText(`2 000 ${RUBLE}`).first()).toBeVisible();

  await page.getByTestId('open-add-employee').click();
  await page.getByTestId('employee-name').fill(IRA);
  await page.getByTestId('employee-rate').fill('3000');
  await page.getByTestId('save-employee').click();

  await expect(page.getByText(IRA).first()).toBeVisible();
  await expect(page.getByText(`5 000 ${RUBLE}`).first()).toBeVisible();

  await page.getByTestId(`delete-employee-${IRA}`).click();

  await expect(page.getByText(IRA)).toHaveCount(0);
  await expect(page.getByText(`2 000 ${RUBLE}`).first()).toBeVisible();
});
