import { expect, test } from '@playwright/test';

import type { ApiAction, AppState } from '../src/domain/types';

const LOCATION = '\u041e\u0441\u043d\u043e\u0432\u043d\u043e\u0439 \u043f\u0443\u043d\u043a\u0442';
const UPDATED_LOCATION = '\u041f\u0412\u0417 \u043d\u0430 \u041b\u0435\u0441\u043d\u043e\u0439';
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
        color: '#a8d5ba',
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
            color: '#f0dd92',
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

  await page.getByTestId('day-31').click();
  await expect(page.getByTestId(`assign-employee-${ANNA}`)).toBeVisible();
  await page.getByText('\u041e\u0442\u043c\u0435\u043d\u0430').click();

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
