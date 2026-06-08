import type { VercelRequest, VercelResponse } from '@vercel/node';

import { ConfigMissingError, InvalidInviteCodeError, MissingDatabaseUrlError, createWorkspace } from './_db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
      return;
    }

    res.status(200).json(await createWorkspace());
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
