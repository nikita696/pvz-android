import AsyncStorage from '@react-native-async-storage/async-storage';

import { emptyAppState } from './domain/seed';
import type { ApiAction, AppState, Employee, PaymentKind, SalaryPayment, Shift } from './domain/types';

const STORAGE_KEY = 'pvz.localState.v1';
const EMPLOYEE_COLORS = ['#7c3aed', '#0e7490', '#b45309', '#047857', '#4f46e5', '#2563eb'];

export async function loadStoredState(): Promise<AppState> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);

  if (!stored) {
    return cloneState(emptyAppState);
  }

  return normalizeState(JSON.parse(stored) as Partial<AppState>);
}

export async function saveStoredState(state: AppState): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function applyLocalAction(state: AppState, action: ApiAction): AppState {
  if (action.action === 'updateLocation') {
    return {
      ...state,
      location: { ...state.location, name: action.name.trim() },
    };
  }

  if (action.action === 'addEmployee') {
    const id = createId('employee');
    const employee: Employee = {
      id,
      name: action.name.trim(),
      dailyRate: Math.round(action.dailyRate),
      color: getEmployeeColor(id),
      active: true,
      createdAt: new Date().toISOString(),
    };

    return { ...state, employees: [...state.employees, employee] };
  }

  if (action.action === 'archiveEmployee') {
    return {
      ...state,
      employees: state.employees.map((employee) =>
        employee.id === action.employeeId ? { ...employee, active: false } : employee,
      ),
    };
  }

  if (action.action === 'deleteEmployee') {
    const deletedEmployee = state.employees.find(
      (employee) => employee.id === action.employeeId && !employee.active,
    );

    if (!deletedEmployee) {
      return state;
    }

    return {
      ...state,
      employees: state.employees.filter((employee) => employee.id !== action.employeeId),
      shifts: state.shifts.filter((shift) => shift.employeeId !== action.employeeId),
      payments: state.payments.filter((payment) => payment.employeeId !== action.employeeId),
    };
  }

  if (action.action === 'toggleShift') {
    if (!state.employees.some((employee) => employee.id === action.employeeId)) {
      return state;
    }

    const existingShift = state.shifts.find(
      (shift) => shift.employeeId === action.employeeId && shift.date === action.date,
    );

    if (existingShift) {
      return {
        ...state,
        shifts: state.shifts.filter((shift) => shift.id !== existingShift.id),
      };
    }

    const shift: Shift = {
      id: createId('shift'),
      employeeId: action.employeeId,
      date: action.date,
    };

    return { ...state, shifts: [...state.shifts, shift] };
  }

  if (action.action === 'saveDayNote') {
    const comment = action.comment.trim();
    const dayNotes = state.dayNotes.filter((note) => note.date !== action.date);

    if (!comment) {
      return { ...state, dayNotes };
    }

    return {
      ...state,
      dayNotes: [
        ...dayNotes,
        {
          date: action.date,
          comment,
          updatedAt: new Date().toISOString(),
        },
      ].sort((first, second) => first.date.localeCompare(second.date)),
    };
  }

  if (action.action === 'addPayment') {
    if (!state.employees.some((employee) => employee.id === action.employeeId)) {
      return state;
    }

    const payment: SalaryPayment = {
      id: createId('payment'),
      employeeId: action.employeeId,
      amount: Math.round(action.amount),
      paidAt: action.paidAt,
      kind: normalizePaymentKind(action.kind),
      comment: (action.comment ?? '').trim(),
    };

    return { ...state, payments: [...state.payments, payment] };
  }

  if (action.action === 'updatePayment') {
    return {
      ...state,
      payments: state.payments.map((payment) =>
        payment.id === action.id && payment.employeeId === action.employeeId
          ? {
              ...payment,
              amount: Math.round(action.amount),
              paidAt: action.paidAt,
              kind: normalizePaymentKind(action.kind),
              comment: (action.comment ?? '').trim(),
            }
          : payment,
      ),
    };
  }

  if (action.action === 'deletePayment') {
    return {
      ...state,
      payments: state.payments.filter(
        (payment) => payment.id !== action.id || payment.employeeId !== action.employeeId,
      ),
    };
  }

  return state;
}

function normalizeState(state: Partial<AppState>): AppState {
  return {
    location: {
      id: typeof state.location?.id === 'string' ? state.location.id : emptyAppState.location.id,
      name: typeof state.location?.name === 'string' ? state.location.name : emptyAppState.location.name,
    },
    employees: Array.isArray(state.employees) ? state.employees.map(normalizeEmployee) : [],
    shifts: Array.isArray(state.shifts) ? state.shifts.map(normalizeShift) : [],
    payments: Array.isArray(state.payments) ? state.payments.map(normalizePayment) : [],
    dayNotes: Array.isArray(state.dayNotes) ? state.dayNotes : [],
  };
}

function normalizeEmployee(employee: Employee): Employee {
  return {
    ...employee,
    color: employee.color || getEmployeeColor(employee.id),
    active: employee.active !== false,
  };
}

function normalizeShift(shift: Shift): Shift {
  return shift;
}

function normalizePayment(payment: SalaryPayment): SalaryPayment {
  return {
    ...payment,
    kind: normalizePaymentKind(payment.kind),
    comment: payment.comment ?? '',
  };
}

function normalizePaymentKind(kind: PaymentKind | undefined): PaymentKind {
  return kind === 'deduction' ? 'deduction' : 'payment';
}

function cloneState(state: AppState): AppState {
  return JSON.parse(JSON.stringify(state)) as AppState;
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function getEmployeeColor(employeeId: string): string {
  const hash = [...employeeId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return EMPLOYEE_COLORS[hash % EMPLOYEE_COLORS.length];
}
