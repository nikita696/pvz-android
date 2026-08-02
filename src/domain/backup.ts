import { EMPLOYEE_COLOR_PALETTE, type AppState, type DayNote, type Employee, type SalaryPayment, type Shift } from './types';

export const BACKUP_FORMAT = 'pvz-android-backup';
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const LIMITS = {
  employees: 200,
  shifts: 10_000,
  payments: 10_000,
  dayNotes: 5_000,
};

export interface WorkspaceBackup {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  state: AppState;
}

export class InvalidBackupError extends Error {
  constructor(message = 'Файл не похож на резервную копию ПВЗ.') {
    super(message);
  }
}

export function createWorkspaceBackup(state: AppState, exportedAt = new Date()): WorkspaceBackup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: exportedAt.toISOString(),
    state: normalizeImportedState(state),
  };
}

export function serializeWorkspaceBackup(state: AppState, exportedAt = new Date()): string {
  return JSON.stringify(createWorkspaceBackup(state, exportedAt), null, 2);
}

export function parseWorkspaceBackup(text: string): WorkspaceBackup {
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) {
    throw new InvalidBackupError('Файл резервной копии больше 5 МБ.');
  }

  let value: unknown;

  try {
    value = JSON.parse(text);
  } catch {
    throw new InvalidBackupError('Не удалось прочитать JSON-файл резервной копии.');
  }

  if (!isRecord(value)) {
    throw new InvalidBackupError();
  }

  const isEnvelope = 'state' in value;
  if (isEnvelope && value.format !== BACKUP_FORMAT) {
    throw new InvalidBackupError('Файл создан другим приложением или имеет неизвестный формат.');
  }

  if (isEnvelope && value.version !== BACKUP_VERSION) {
    throw new InvalidBackupError('Версия резервной копии пока не поддерживается.');
  }

  const exportedAt = isEnvelope && isValidTimestamp(value.exportedAt)
    ? new Date(value.exportedAt).toISOString()
    : new Date().toISOString();

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt,
    state: normalizeImportedState(isEnvelope ? value.state : value),
  };
}

export function normalizeImportedState(value: unknown): AppState {
  if (!isRecord(value) || !isRecord(value.location)) {
    throw new InvalidBackupError();
  }

  const employeesValue = readArray(value.employees, 'сотрудников', LIMITS.employees);
  const shiftsValue = readArray(value.shifts, 'смен', LIMITS.shifts);
  const paymentsValue = readArray(value.payments, 'выплат', LIMITS.payments);
  const dayNotesValue = value.dayNotes === undefined
    ? []
    : readArray(value.dayNotes, 'комментариев', LIMITS.dayNotes);

  const employees = employeesValue.map(normalizeEmployee);
  assertUnique(employees.map((employee) => employee.id), 'В копии повторяются сотрудники.');
  const employeeIds = new Set(employees.map((employee) => employee.id));
  const shifts = shiftsValue.map((shift) => normalizeShift(shift, employeeIds));
  const payments = paymentsValue.map((payment) => normalizePayment(payment, employeeIds));
  const dayNotes = dayNotesValue.map(normalizeDayNote).filter((note) => note.comment.length > 0);

  assertUnique(shifts.map((shift) => shift.id), 'В копии повторяются смены.');
  assertUnique(
    shifts.map((shift) => `${shift.employeeId}:${shift.date}`),
    'В копии одна смена сотрудника указана дважды.',
  );
  assertUnique(payments.map((payment) => payment.id), 'В копии повторяются выплаты.');
  assertUnique(dayNotes.map((note) => note.date), 'В копии повторяются комментарии к дню.');

  return {
    location: {
      id: 'main',
      name: readText(value.location.name, 120, 'название ПВЗ'),
    },
    employees,
    shifts,
    payments,
    dayNotes,
  };
}

function normalizeEmployee(value: unknown, index: number): Employee {
  if (!isRecord(value)) {
    throw new InvalidBackupError(`Некорректный сотрудник №${index + 1}.`);
  }

  const id = readId(value.id, 'сотрудника');
  const rate = Number(value.dailyRate);

  if (!Number.isSafeInteger(rate) || rate < 0 || rate > 100_000_000) {
    throw new InvalidBackupError(`Некорректная ставка у сотрудника №${index + 1}.`);
  }

  return {
    id,
    name: readText(value.name, 80, 'имя сотрудника'),
    dailyRate: rate,
    color: normalizeEmployeeColor(value.color, id),
    active: value.active !== false,
    createdAt: isValidTimestamp(value.createdAt)
      ? new Date(value.createdAt).toISOString()
      : new Date(0).toISOString(),
  };
}

function normalizeShift(value: unknown, employeeIds: Set<string>): Shift {
  if (!isRecord(value)) {
    throw new InvalidBackupError('Некорректная запись смены.');
  }

  const employeeId = readId(value.employeeId, 'сотрудника в смене');
  if (!employeeIds.has(employeeId)) {
    throw new InvalidBackupError('В смене указан отсутствующий сотрудник.');
  }

  return {
    id: readId(value.id, 'смены'),
    employeeId,
    date: readDate(value.date, 'смены'),
  };
}

function normalizePayment(value: unknown, employeeIds: Set<string>): SalaryPayment {
  if (!isRecord(value)) {
    throw new InvalidBackupError('Некорректная запись выплаты.');
  }

  const employeeId = readId(value.employeeId, 'сотрудника в выплате');
  const amount = Number(value.amount);

  if (!employeeIds.has(employeeId)) {
    throw new InvalidBackupError('В выплате указан отсутствующий сотрудник.');
  }

  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 100_000_000) {
    throw new InvalidBackupError('В копии указана некорректная сумма выплаты.');
  }

  return {
    id: readId(value.id, 'выплаты'),
    employeeId,
    amount,
    paidAt: readDate(value.paidAt, 'выплаты'),
    kind: value.kind === 'deduction' ? 'deduction' : 'payment',
    comment: typeof value.comment === 'string' ? value.comment.trim().slice(0, 80) : '',
  };
}

function normalizeDayNote(value: unknown): DayNote {
  if (!isRecord(value)) {
    throw new InvalidBackupError('Некорректный комментарий ко дню.');
  }

  return {
    date: readDate(value.date, 'комментария'),
    comment: typeof value.comment === 'string' ? value.comment.trim().slice(0, 160) : '',
    updatedAt: isValidTimestamp(value.updatedAt)
      ? new Date(value.updatedAt).toISOString()
      : new Date(0).toISOString(),
  };
}

function readArray(value: unknown, label: string, limit: number): unknown[] {
  if (!Array.isArray(value)) {
    throw new InvalidBackupError(`В копии нет списка ${label}.`);
  }

  if (value.length > limit) {
    throw new InvalidBackupError(`В копии слишком много ${label}.`);
  }

  return value;
}

function readId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 160) {
    throw new InvalidBackupError(`Некорректный идентификатор ${label}.`);
  }

  return value.trim();
}

function readText(value: unknown, maxLength: number, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw new InvalidBackupError(`Некорректное ${label}.`);
  }

  return value.trim();
}

function readDate(value: unknown, label: string): string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) {
    throw new InvalidBackupError(`Некорректная дата ${label}.`);
  }

  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new InvalidBackupError(`Некорректная дата ${label}.`);
  }

  return value;
}

function normalizeEmployeeColor(value: unknown, employeeId: string): string {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    const saved = EMPLOYEE_COLOR_PALETTE.find((color) => color.toLowerCase() === normalized);
    if (saved) {
      return saved;
    }
  }

  return EMPLOYEE_COLOR_PALETTE[getEmployeeColorIndex(employeeId)];
}

function getEmployeeColorIndex(employeeId: string): number {
  return [...employeeId].reduce((sum, character) => sum + character.charCodeAt(0), 0)
    % EMPLOYEE_COLOR_PALETTE.length;
}

function assertUnique(values: string[], message: string) {
  if (new Set(values).size !== values.length) {
    throw new InvalidBackupError(message);
  }
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
