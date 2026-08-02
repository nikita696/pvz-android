import { describe, expect, it } from 'vitest';

import { BACKUP_FORMAT, InvalidBackupError, parseWorkspaceBackup, serializeWorkspaceBackup } from './backup';
import type { AppState } from './types';

const state: AppState = {
  location: { id: 'main', name: 'ПВЗ Тест' },
  employees: [
    {
      id: 'employee-1',
      name: 'Анна',
      dailyRate: 2500,
      color: '#7c3aed',
      active: true,
      createdAt: '2026-05-01T00:00:00.000Z',
    },
  ],
  shifts: [{ id: 'shift-1', employeeId: 'employee-1', date: '2026-05-02' }],
  payments: [
    {
      id: 'payment-1',
      employeeId: 'employee-1',
      amount: 1000,
      paidAt: '2026-05-03',
      kind: 'payment',
      comment: 'аванс',
    },
  ],
  dayNotes: [
    {
      date: '2026-05-02',
      comment: 'замена',
      updatedAt: '2026-05-02T12:00:00.000Z',
    },
  ],
};

describe('workspace backup', () => {
  it('round-trips the complete workspace state', () => {
    const text = serializeWorkspaceBackup(state, new Date('2026-06-01T10:30:00.000Z'));
    const backup = parseWorkspaceBackup(text);

    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(backup.exportedAt).toBe('2026-06-01T10:30:00.000Z');
    expect(backup.state).toEqual(state);
  });

  it('accepts an old raw state and fills optional fields safely', () => {
    const oldState = {
      ...state,
      employees: [{ ...state.employees[0], color: undefined, createdAt: undefined }],
      payments: [{ ...state.payments[0], kind: undefined, comment: undefined }],
      dayNotes: undefined,
    };
    const backup = parseWorkspaceBackup(JSON.stringify(oldState));

    expect(backup.state.employees[0].color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(backup.state.employees[0].createdAt).toBe('1970-01-01T00:00:00.000Z');
    expect(backup.state.payments[0]).toMatchObject({ kind: 'payment', comment: '' });
    expect(backup.state.dayNotes).toEqual([]);
  });

  it('rejects references to employees that are not in the backup', () => {
    const brokenState = {
      ...state,
      shifts: [{ ...state.shifts[0], employeeId: 'missing-employee' }],
    };

    expect(() => parseWorkspaceBackup(JSON.stringify(brokenState))).toThrow(InvalidBackupError);
  });

  it('rejects duplicate employee shifts on the same day', () => {
    const brokenState = {
      ...state,
      shifts: [state.shifts[0], { ...state.shifts[0], id: 'shift-2' }],
    };

    expect(() => parseWorkspaceBackup(JSON.stringify(brokenState))).toThrow(
      'В копии одна смена сотрудника указана дважды.',
    );
  });
});
