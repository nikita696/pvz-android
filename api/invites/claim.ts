import type { VercelRequest, VercelResponse } from '@vercel/node';

import { ConfigMissingError, InvalidInviteCodeError, MissingDatabaseUrlError, claimInvite } from '../_db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
      return;
    }

    const body = readBody(req.body);
    const code = typeof body.code === 'string' ? body.code : '';

    if (!code.trim()) {
      res.status(400).json({ error: 'BAD_REQUEST' });
      return;
    }

    res.status(200).json(await claimInvite(code));
  } catch (error) {
    if (error instanceof MissingDatabaseUrlError) {
      res.status(503).json({
        error: 'DATABASE_URL_MISSING',
        message: 'Set DATABASE_URL to a Neon Postgres connection string.',
      });
      return;
    }

    if (error instanceof InvalidInviteCodeError) {
      res.status(403).json({ error: 'INVALID_INVITE_CODE' });
      return;
    }

    if (error instanceof ConfigMissingError) {
      res.status(503).json({ error: 'CONFIG_MISSING' });
      return;
    }

    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}

function readBody(body: unknown): { code?: unknown } {
  if (typeof body === 'string') {
    return JSON.parse(body) as { code?: unknown };
  }

  return body && typeof body === 'object' ? (body as { code?: unknown }) : {};
}
