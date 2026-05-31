import type { VercelRequest, VercelResponse } from '@vercel/node';

import {
  MissingDatabaseUrlError,
  addEmployee,
  addPayment,
  archiveEmployee,
  getState,
  toggleShift,
} from './_db';
import type { ApiAction } from '../src/domain/types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      res.status(200).json(await getState());
      return;
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
      return;
    }

    const body = readAction(req.body);
    await applyAction(body);
    res.status(200).json(await getState());
  } catch (error) {
    if (error instanceof MissingDatabaseUrlError) {
      res.status(503).json({
        error: 'DATABASE_URL_MISSING',
        message: 'Set DATABASE_URL to a Neon Postgres connection string.',
      });
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

async function applyAction(body: ApiAction) {
  if (!body || typeof body.action !== 'string') {
    throw new Error('BAD_REQUEST');
  }

  if (body.action === 'addEmployee') {
    if (!body.name.trim() || !Number.isFinite(body.dailyRate) || body.dailyRate <= 0) {
      throw new Error('BAD_REQUEST');
    }

    await addEmployee(body.name.trim(), body.dailyRate);
    return;
  }

  if (body.action === 'archiveEmployee') {
    if (!body.employeeId) {
      throw new Error('BAD_REQUEST');
    }

    await archiveEmployee(body.employeeId);
    return;
  }

  if (body.action === 'toggleShift') {
    if (!body.employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      throw new Error('BAD_REQUEST');
    }

    await toggleShift(body.employeeId, body.date);
    return;
  }

  if (body.action === 'addPayment') {
    if (
      !body.employeeId ||
      !Number.isFinite(body.amount) ||
      body.amount <= 0 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(body.paidAt)
    ) {
      throw new Error('BAD_REQUEST');
    }

    await addPayment(body.employeeId, body.amount, body.paidAt);
    return;
  }

  throw new Error('BAD_REQUEST');
}
