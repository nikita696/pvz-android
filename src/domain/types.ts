export const EMPLOYEE_COLOR_PALETTE = [
  '#7c3aed',
  '#0e7490',
  '#b45309',
  '#2563eb',
  '#dc2626',
  '#db2777',
  '#65a30d',
] as const;

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
  rateHistory?: EmployeeRate[];
}

export interface EmployeeRate {
  id: string;
  dailyRate: number;
  effectiveDate: string;
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
  updatedAt?: string;
}

export interface DayNote {
  date: string;
  comment: string;
  updatedAt: string;
}

export interface AppState {
  location: Location;
  employees: Employee[];
  shifts: Shift[];
  payments: SalaryPayment[];
  dayNotes: DayNote[];
  backups?: WorkspaceBackupSummary[];
  backupPreview?: WorkspaceBackupPreview;
}

export type WorkspaceBackupSource = 'daily' | 'pre-import' | 'pre-restore' | 'manual' | 'legacy';

export interface WorkspaceBackupSummary {
  id: string;
  createdAt: string;
  source: WorkspaceBackupSource;
  locationName: string;
  employees: number;
  shifts: number;
  payments: number;
  dayNotes: number;
}

export interface WorkspaceBackupPreview extends WorkspaceBackupSummary {
  employeeNames: string[];
  firstDate: string | null;
  lastDate: string | null;
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
  | { action: 'addEmployee'; id?: string; name: string; dailyRate: number; color?: string }
  | {
      action: 'updateEmployee';
      employeeId: string;
      name?: string;
      dailyRate?: number;
      effectiveDate?: string;
    }
  | { action: 'updateEmployeeColor'; employeeId: string; color: string }
  | { action: 'toggleShift'; employeeId: string; date: string }
  | { action: 'setShift'; employeeId: string; date: string; assigned: boolean }
  | { action: 'saveDayNote'; date: string; comment: string }
  | {
      action: 'addPayment';
      id?: string;
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
      expectedUpdatedAt?: string;
    }
  | {
      action: 'deletePayment';
      id: string;
      employeeId: string;
      undoToken?: string;
      expectedUpdatedAt?: string;
    }
  | { action: 'restoreDeletedPayment'; undoToken: string }
  | { action: 'archiveEmployee'; employeeId: string }
  | { action: 'restoreEmployee'; employeeId: string }
  | { action: 'deleteEmployee'; employeeId: string; undoToken?: string }
  | { action: 'restoreDeletedEmployee'; undoToken: string }
  | { action: 'importState'; state: AppState }
  | { action: 'previewBackup'; backupId: string }
  | { action: 'restoreBackup'; backupId: string }
  | { action: 'revokeCurrentSession' };
