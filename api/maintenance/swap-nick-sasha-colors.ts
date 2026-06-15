import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

const NICK_ID = 'cd253814-0e7b-4a3c-90ec-7884d31ef1ac';
const SASHA_ID = 'c1d504cd-3170-415d-81a1-606686e8095a';
const NICK_COLOR = '#047857';
const SASHA_COLOR = '#7c3aed';
const WORKSPACE_ID = process.env.PVZ_DEFAULT_WORKSPACE_ID?.trim() || 'nick-main';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    res.status(503).json({ error: 'DATABASE_URL_MISSING' });
    return;
  }

  const sql = neon(databaseUrl);

  await sql`
    update employees
    set color = ${NICK_COLOR}
    where id = ${NICK_ID}
      and workspace_id = ${WORKSPACE_ID}
  `;
  await sql`
    update employees
    set color = ${SASHA_COLOR}
    where id = ${SASHA_ID}
      and workspace_id = ${WORKSPACE_ID}
  `;

  res.status(200).json({ ok: true });
}
