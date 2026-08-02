import type { VercelRequest, VercelResponse } from '@vercel/node';

import {
  MissingDatabaseUrlError,
  UnauthorizedError,
  addEmployee,
  addPayment,
  archiveEmployee,
  deletePayment,
  deleteArchivedEmployee,
  getState,
  importWorkspaceState,
  requireWorkspaceSession,
  restoreDeletedEmployee,
  saveDayNote,
  toggleShift,
  updateLocationName,
  updatePayment,
  updateEmployeeColor,
} from './_db';
import { EMPLOYEE_COLOR_PALETTE, type ApiAction } from '../src/domain/types';
import { InvalidBackupError } from '../src/domain/backup';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const workspaceId = await requireWorkspaceSession(readBearerToken(req));

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
    await applyAction(workspaceId, body);
    res.status(200).json(await getState(workspaceId));
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

    if (error instanceof Error && error.message === 'BAD_REQUEST') {
      res.status(400).json({ error: 'BAD_REQUEST' });
      return;
    }

    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}

function readAction(body: unknown): ApiAction {
  if (typeof body === 'string') {
    return JSON.parse(body) as ApiAction;
  }

  return body as ApiAction;
}

async function applyAction(workspaceId: string, body: ApiAction) {
  if (!body || typeof body.action !== 'string') {
    throw new Error('BAD_REQUEST');
  }

  if (body.action === 'addEmployee') {
    const color = body.color?.trim();
    const validColor = color && EMPLOYEE_COLOR_PALETTE.includes(color as (typeof EMPLOYEE_COLOR_PALETTE)[number])
      ? color
      : undefined;

    if (!body.name.trim() || !Number.isFinite(body.dailyRate) || body.dailyRate < 0) {
      throw new Error('BAD_REQUEST');
    }

    if (color && !validColor) {
      throw new Error('BAD_REQUEST');
    }

    await addEmployee(workspaceId, body.name.trim(), body.dailyRate, validColor);
    return;
  }

  if (body.action === 'updateLocation') {
    if (!body.name.trim()) {
      throw new Error('BAD_REQUEST');
    }

    await updateLocationName(workspaceId, body.name.trim());
    return;
  }

  if (body.action === 'updateEmployeeColor') {
    if (
      !body.employeeId ||
      !EMPLOYEE_COLOR_PALETTE.includes(body.color as (typeof EMPLOYEE_COLOR_PALETTE)[number])
    ) {
      throw new Error('BAD_REQUEST');
    }

    await updateEmployeeColor(workspaceId, body.employeeId, body.color);
    return;
  }

  if (body.action === 'archiveEmployee') {
    if (!body.employeeId) {
      throw new Error('BAD_REQUEST');
    }

    await archiveEmployee(workspaceId, body.employeeId);
    return;
  }

  if (body.action === 'deleteEmployee') {
    if (!body.employeeId) {
      throw new Error('BAD_REQUEST');
    }

    const undoToken = body.undoToken?.trim() || crypto.randomUUID();

    if (undoToken.length < 12 || undoToken.length > 200) {
      throw new Error('BAD_REQUEST');
    }

    await deleteArchivedEmployee(workspaceId, body.employeeId, undoToken);
    return;
  }

  if (body.action === 'restoreDeletedEmployee') {
    const undoToken = body.undoToken?.trim();

    if (!undoToken || undoToken.length < 12 || undoToken.length > 200) {
      throw new Error('BAD_REQUEST');
    }

    await restoreDeletedEmployee(workspaceId, undoToken);
    return;
  }

  if (body.action === 'toggleShift') {
    if (!body.employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      throw new Error('BAD_REQUEST');
    }

    await toggleShift(workspaceId, body.employeeId, body.date);
    return;
  }

  if (body.action === 'saveDayNote') {
    const comment = body.comment.trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date) || comment.length > 160) {
      throw new Error('BAD_REQUEST');
    }

    await saveDayNote(workspaceId, body.date, comment);
    return;
  }

  if (body.action === 'addPayment') {
    const kind = body.kind === 'deduction' ? 'deduction' : 'payment';
    const comment = (body.comment ?? '').trim();

    if (
      !body.employeeId ||
      !Number.isFinite(body.amount) ||
      body.amount <= 0 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(body.paidAt) ||
      comment.length > 80
    ) {
      throw new Error('BAD_REQUEST');
    }

    await addPayment(workspaceId, body.employeeId, body.amount, body.paidAt, kind, comment);
    return;
  }

  if (body.action === 'updatePayment') {
    const kind = body.kind === 'deduction' ? 'deduction' : 'payment';
    const comment = (body.comment ?? '').trim();

    if (
      !body.id ||
      !body.employeeId ||
      !Number.isFinite(body.amount) ||
      body.amount <= 0 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(body.paidAt) ||
      comment.length > 80
    ) {
      throw new Error('BAD_REQUEST');
    }

    await updatePayment(workspaceId, body.id, body.employeeId, body.amount, body.paidAt, kind, comment);
    return;
  }

  if (body.action === 'deletePayment') {
    if (!body.id || !body.employeeId) {
      throw new Error('BAD_REQUEST');
    }

    await deletePayment(workspaceId, body.id, body.employeeId);
    return;
  }

  if (body.action === 'importState') {
    try {
      await importWorkspaceState(workspaceId, body.state);
    } catch (error) {
      if (error instanceof InvalidBackupError) {
        throw new Error('BAD_REQUEST', { cause: error });
      }

      throw error;
    }
    return;
  }

  throw new Error('BAD_REQUEST');
}

function readBearerToken(req: VercelRequest): string | null {
  const header = req.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;

  if (!value?.startsWith('Bearer ')) {
    return null;
  }

  return value.slice('Bearer '.length).trim() || null;
}
