import type { VercelRequest, VercelResponse } from '@vercel/node';

import {
  MissingDatabaseUrlError,
  UnauthorizedError,
  requireWorkspaceSession,
} from './_db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
      return;
    }

    // Require valid session (will throw UnauthorizedError if invalid)
    await requireWorkspaceSession(readBearerToken(req));

    // Workspace creation disabled - only join via invite code
    res.status(410).json({ error: 'WORKSPACE_CREATION_DISABLED' });
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

    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}

function readBearerToken(req: VercelRequest): string | null {
  const header = req.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;

  if (!value?.startsWith('Bearer ')) {
    return null;
  }

  return value.slice('Bearer '.length).trim() || null;
}
