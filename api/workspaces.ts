import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(410).json({ error: 'WORKSPACE_CREATION_DISABLED' });
}
