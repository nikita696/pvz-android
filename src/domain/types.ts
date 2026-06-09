export interface Location {
  id: string;
  name: string;
}

export interface Employee {
  id: string;
  name: string;
  dailyRate: number;
  color: string;
  active: boolean;
  createdAt: string;
}

export interface Shift {
  id: string;
  employeeId: string;
  date: string;
}

export type PaymentKind = 'payment' | 'deduction';

export interface SalaryPayment {
  id: string;
  employeeId: string;
  amount: number;
  paidAt: string;
  kind: PaymentKind;
  comment: string;
}

export interface DayNote {
  date: string;
  comment: string;
  updatedAt: string;
}

export interface WorkspaceInfo {
  inviteCode: string;
}

export interface AppState {
  workspace?: WorkspaceInfo;
  location: Location;
  employees: Employee[];
  shifts: Shift[];
  payments: SalaryPayment[];
  dayNotes: DayNote[];
}

export interface SalarySummary {
  employeeId: string;
  workedShifts: number;
  dailyRate: number;
  accrued: number;
  paid: number;
  deductions: number;
  paidAndDeductions: number;
  due: number;
}

export type ApiAction =
  | { action: 'updateLocation'; name: string }
  | { action: 'addEmployee'; name: string; dailyRate: number }
  | { action: 'toggleShift'; employeeId: string; date: string }
  | { action: 'saveDayNote'; date: string; comment: string }
  | {
      action: 'addPayment';
      employeeId: string;
      amount: number;
      paidAt: string;
      kind?: PaymentKind;
      comment?: string;
    }
  | {
      action: 'updatePayment';
      id: string;
      employeeId: string;
      amount: number;
      paidAt: string;
      kind?: PaymentKind;
      comment?: string;
    }
  | { action: 'deletePayment'; id: string; employeeId: string }
  | { action: 'archiveEmployee'; employeeId: string }
  | { action: 'deleteEmployee'; employeeId: string };
