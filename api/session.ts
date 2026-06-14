import type { VercelRequest, VercelResponse } from '@vercel/node';

import {
  ConfigMissingError,
  InvalidOwnerPasswordError,
  MissingDatabaseUrlError,
  createOwnerSession,
} from './_db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
      return;
    }

    const body = readBody(req.body);
    const password = typeof body.password === 'string' ? body.password : '';

    if (!password.trim()) {
      res.status(400).json({ error: 'BAD_REQUEST' });
      return;
    }

    res.status(200).json(await createOwnerSession(password));
  } catch (error) {
    if (error instanceof MissingDatabaseUrlError) {
      res.status(503).json({
        error: 'DATABASE_URL_MISSING',
        message: 'Set DATABASE_URL to a Neon Postgres connection string.',
      });
      return;
    }

    if (error instanceof InvalidOwnerPasswordError) {
      res.status(403).json({ error: 'INVALID_OWNER_PASSWORD' });
      return;
    }

    if (error instanceof ConfigMissingError) {
      res.status(503).json({ error: 'CONFIG_MISSING' });
      return;
    }

    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}

function readBody(body: unknown): { password?: unknown } {
  if (typeof body === 'string') {
    return JSON.parse(body) as { password?: unknown };
  }

  return body && typeof body === 'object' ? (body as { password?: unknown }) : {};
}
