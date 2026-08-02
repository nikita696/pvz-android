import type { VercelRequest, VercelResponse } from '@vercel/node';

import { MissingDatabaseUrlError, createWorkspaceBackup } from '../_db';

const DEFAULT_WORKSPACE_ID = 'nick-main';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    return;
  }

  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[daily-backup] CRON_SECRET is not configured');
    res.status(503).json({ error: 'CRON_SECRET_MISSING' });
    return;
  }

  if (readAuthorization(req) !== `Bearer ${cronSecret}`) {
    res.status(401).json({ error: 'UNAUTHORIZED' });
    return;
  }

  const workspaceId = process.env.PVZ_DEFAULT_WORKSPACE_ID?.trim() || DEFAULT_WORKSPACE_ID;

  try {
    console.log('[daily-backup] started', { workspaceId });
    const backup = await createWorkspaceBackup(workspaceId);
    console.log('[daily-backup] completed', backup);
    res.status(200).json({ ok: true, backup });
  } catch (error) {
    if (error instanceof MissingDatabaseUrlError) {
      console.error('[daily-backup] DATABASE_URL is not configured');
      res.status(503).json({ error: 'DATABASE_URL_MISSING' });
      return;
    }

    console.error('[daily-backup] failed', error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}

function readAuthorization(req: VercelRequest): string {
  const header = req.headers.authorization;
  return (Array.isArray(header) ? header[0] : header) ?? '';
}
