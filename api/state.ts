import type { VercelRequest, VercelResponse } from '@vercel/node';

import {
  BackupNotFoundError,
  MissingDatabaseUrlError,
  PaymentConflictError,
  PaymentNotFoundError,
  PaymentUndoUnavailableError,
  ResourceConflictError,
  UnauthorizedError,
  addEmployee,
  addPayment,
  archiveEmployee,
  deleteArchivedEmployee,
  deletePayment,
  getState,
  importWorkspaceState,
  previewWorkspaceBackup,
  requireWorkspaceSession,
  restoreDeletedEmployee,
  restoreDeletedPayment,
  restoreEmployee,
  restoreWorkspaceBackup,
  revokeWorkspaceSession,
  saveDayNote,
  setShift,
  toggleShift,
  updateEmployee,
  updateEmployeeColor,
  updateLocationName,
  updatePayment,
} from './_db';
import { InvalidBackupError } from '../src/domain/backup';
import {
  EMPLOYEE_COLOR_PALETTE,
  type PaymentKind,
  type WorkspaceBackupPreview,
} from '../src/domain/types';
import { isPaymentKind, isValidIsoDate, isValidPaymentAmount } from '../src/domain/paymentValidation';

const MAX_POSTGRES_INTEGER = 2_147_483_647;

type ActionResult = { backupPreview?: WorkspaceBackupPreview };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const token = readBearerToken(req);
    const workspaceId = await requireWorkspaceSession(token);

    if (req.method === 'GET') {
      res.status(200).json(await getState(workspaceId));
      return;
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
      return;
    }

    const body = readAction(req.body);
    const result = await applyAction(workspaceId, token ?? '', body);
    res.status(200).json(await getState(workspaceId, { backupPreview: result.backupPreview }));
  } catch (error) {
    if (error instanceof MissingDatabaseUrlError) {
      res.status(503).json({
        error: 'DATABASE_URL_MISSING',
        message: 'Set DATABASE_URL to a Neon Postgres connection string.',
      });
      return;
    }

    if (error instanceof UnauthorizedError) {
      res.status(401).json({ error: 'UNAUTHORIZED' });
      return;
    }

    if (error instanceof PaymentNotFoundError) {
      res.status(409).json({ error: 'PAYMENT_NOT_FOUND' });
      return;
    }

    if (error instanceof PaymentConflictError) {
      res.status(409).json({ error: 'PAYMENT_CONFLICT' });
      return;
    }

    if (error instanceof PaymentUndoUnavailableError) {
      res.status(409).json({ error: 'PAYMENT_UNDO_UNAVAILABLE' });
      return;
    }

    if (error instanceof ResourceConflictError) {
      res.status(409).json({ error: 'CONFLICT' });
      return;
    }

    if (error instanceof BackupNotFoundError) {
      res.status(404).json({ error: 'BACKUP_NOT_FOUND' });
      return;
    }

    if (error instanceof InvalidBackupError) {
      res.status(400).json({ error: 'INVALID_BACKUP' });
      return;
    }

    if (error instanceof Error && error.message === 'BAD_REQUEST') {
      res.status(400).json({ error: 'BAD_REQUEST' });
      return;
    }

    console.error('[state] request failed', error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}

function readAction(body: unknown): Record<string, unknown> {
  let value = body;

  if (typeof value === 'string') {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      throwBadRequest();
    }
  }

  if (!isRecord(value) || typeof value.action !== 'string') {
    throwBadRequest();
  }

  return value;
}

async function applyAction(
  workspaceId: string,
  sessionToken: string,
  body: Record<string, unknown>,
): Promise<ActionResult> {
  const action = body.action;

  if (action === 'addEmployee') {
    const id = readOptionalId(body.id);
    const name = readString(body.name, 1, 80);
    const dailyRate = readInteger(body.dailyRate, 0, MAX_POSTGRES_INTEGER);
    const color = readOptionalString(body.color, 1, 32);

    if (color && !EMPLOYEE_COLOR_PALETTE.includes(color as (typeof EMPLOYEE_COLOR_PALETTE)[number])) {
      throwBadRequest();
    }

    await addEmployee(workspaceId, name, dailyRate, color, id);
    return {};
  }

  if (action === 'updateEmployee') {
    const employeeId = readId(body.employeeId);
    const name = readOptionalString(body.name, 1, 80);
    const hasRate = body.dailyRate !== undefined;
    const hasDate = body.effectiveDate !== undefined;
    const dailyRate = hasRate ? readInteger(body.dailyRate, 0, MAX_POSTGRES_INTEGER) : undefined;
    const effectiveDate = hasDate ? readDate(body.effectiveDate) : undefined;

    if (name === undefined && dailyRate === undefined) {
      throwBadRequest();
    }

    if (hasRate !== hasDate) {
      throwBadRequest();
    }

    await updateEmployee(workspaceId, employeeId, name, dailyRate, effectiveDate);
    return {};
  }

  if (action === 'updateLocation') {
    await updateLocationName(workspaceId, readString(body.name, 1, 120));
    return {};
  }

  if (action === 'updateEmployeeColor') {
    const employeeId = readId(body.employeeId);
    const color = readString(body.color, 1, 32);

    if (!EMPLOYEE_COLOR_PALETTE.includes(color as (typeof EMPLOYEE_COLOR_PALETTE)[number])) {
      throwBadRequest();
    }

    await updateEmployeeColor(workspaceId, employeeId, color);
    return {};
  }

  if (action === 'archiveEmployee') {
    await archiveEmployee(workspaceId, readId(body.employeeId));
    return {};
  }

  if (action === 'restoreEmployee') {
    await restoreEmployee(workspaceId, readId(body.employeeId));
    return {};
  }

  if (action === 'deleteEmployee') {
    const employeeId = readId(body.employeeId);
    const undoToken = readOptionalToken(body.undoToken) ?? crypto.randomUUID();
    await deleteArchivedEmployee(workspaceId, employeeId, undoToken);
    return {};
  }

  if (action === 'restoreDeletedEmployee') {
    await restoreDeletedEmployee(workspaceId, readString(body.undoToken, 12, 200));
    return {};
  }

  if (action === 'toggleShift') {
    await toggleShift(workspaceId, readId(body.employeeId), readDate(body.date));
    return {};
  }

  if (action === 'setShift') {
    await setShift(
      workspaceId,
      readId(body.employeeId),
      readDate(body.date),
      readBoolean(body.assigned),
    );
    return {};
  }

  if (action === 'saveDayNote') {
    await saveDayNote(workspaceId, readDate(body.date), readString(body.comment, 0, 160));
    return {};
  }

  if (action === 'addPayment') {
    const id = readOptionalId(body.id);
    const employeeId = readId(body.employeeId);
    const amount = readPaymentAmount(body.amount);
    const paidAt = readDate(body.paidAt);
    const kind = readPaymentKind(body.kind);
    const comment = readOptionalString(body.comment, 0, 80) ?? '';
    await addPayment(workspaceId, employeeId, amount, paidAt, kind, comment, id);
    return {};
  }

  if (action === 'updatePayment') {
    const id = readId(body.id);
    const employeeId = readId(body.employeeId);
    const amount = readPaymentAmount(body.amount);
    const paidAt = readDate(body.paidAt);
    const kind = readPaymentKind(body.kind);
    const comment = readOptionalString(body.comment, 0, 80) ?? '';
    const expectedUpdatedAt = readOptionalTimestamp(body.expectedUpdatedAt);
    await updatePayment(
      workspaceId,
      id,
      employeeId,
      amount,
      paidAt,
      kind,
      comment,
      expectedUpdatedAt,
    );
    return {};
  }

  if (action === 'deletePayment') {
    const id = readId(body.id);
    const employeeId = readId(body.employeeId);
    const undoToken = readOptionalToken(body.undoToken) ?? crypto.randomUUID();
    const expectedUpdatedAt = readOptionalTimestamp(body.expectedUpdatedAt);
    await deletePayment(workspaceId, id, employeeId, undoToken, expectedUpdatedAt);
    return {};
  }

  if (action === 'restoreDeletedPayment') {
    await restoreDeletedPayment(workspaceId, readString(body.undoToken, 12, 200));
    return {};
  }

  if (action === 'importState') {
    if (body.state === undefined) {
      throwBadRequest();
    }

    await importWorkspaceState(workspaceId, body.state);
    return {};
  }

  if (action === 'previewBackup') {
    return { backupPreview: await previewWorkspaceBackup(workspaceId, readId(body.backupId)) };
  }

  if (action === 'restoreBackup') {
    await restoreWorkspaceBackup(workspaceId, readId(body.backupId));
    return {};
  }

  if (action === 'revokeCurrentSession') {
    await revokeWorkspaceSession(workspaceId, sessionToken);
    return {};
  }

  throwBadRequest();
}

function readPaymentKind(value: unknown): PaymentKind {
  const kind = value === undefined ? 'payment' : value;
  if (!isPaymentKind(kind)) {
    throwBadRequest();
  }

  return kind;
}

function readPaymentAmount(value: unknown): number {
  if (!isValidPaymentAmount(value)) {
    throwBadRequest();
  }

  return value;
}

function readId(value: unknown): string {
  return readString(value, 1, 160);
}

function readOptionalId(value: unknown): string | undefined {
  return value === undefined ? undefined : readId(value);
}

function readDate(value: unknown): string {
  if (!isValidIsoDate(value)) {
    throwBadRequest();
  }

  return value;
}

function readBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throwBadRequest();
  }

  return value;
}

function readInteger(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throwBadRequest();
  }

  return value;
}

function readString(value: unknown, minLength: number, maxLength: number): string {
  if (typeof value !== 'string') {
    throwBadRequest();
  }

  const normalized = value.trim();
  if (normalized.length < minLength || normalized.length > maxLength) {
    throwBadRequest();
  }

  return normalized;
}

function readOptionalString(
  value: unknown,
  minLength: number,
  maxLength: number,
): string | undefined {
  return value === undefined ? undefined : readString(value, minLength, maxLength);
}

function readOptionalTimestamp(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string' || value.length > 80 || Number.isNaN(Date.parse(value))) {
    throwBadRequest();
  }

  return new Date(value).toISOString();
}

function readOptionalToken(value: unknown): string | undefined {
  if (value === undefined || (typeof value === 'string' && !value.trim())) {
    return undefined;
  }

  return readString(value, 12, 200);
}

function readBearerToken(req: VercelRequest): string | null {
  const header = req.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;

  if (!value?.startsWith('Bearer ')) {
    return null;
  }

  const token = value.slice('Bearer '.length).trim();
  return token.length > 0 && token.length <= 200 ? token : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function throwBadRequest(): never {
  throw new Error('BAD_REQUEST');
}
