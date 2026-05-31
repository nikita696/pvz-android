export interface Location {
  id: string;
  name: string;
}

export interface Employee {
  id: string;
  name: string;
  dailyRate: number;
  active: boolean;
  createdAt: string;
}

export interface Shift {
  id: string;
  employeeId: string;
  date: string;
}

export interface SalaryPayment {
  id: string;
  employeeId: string;
  amount: number;
  paidAt: string;
}

export interface AppState {
  location: Location;
  employees: Employee[];
  shifts: Shift[];
  payments: SalaryPayment[];
}

export interface SalarySummary {
  employeeId: string;
  workedShifts: number;
  dailyRate: number;
  accrued: number;
  paid: number;
  due: number;
}

export type ApiAction =
  | { action: 'addEmployee'; name: string; dailyRate: number }
  | { action: 'toggleShift'; employeeId: string; date: string }
  | { action: 'addPayment'; employeeId: string; amount: number; paidAt: string }
  | { action: 'archiveEmployee'; employeeId: string };
