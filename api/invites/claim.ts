import type { VercelRequest, VercelResponse } from '@vercel/node';

import {
  ConfigMissingError,
  InvalidInviteCodeError,
  MissingDatabaseUrlError,
  claimInvite,
} from '../_db';

const BUILTIN_INVITE_CODE = 'tokyo';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    return;
  }

  const code = typeof req.body?.code === 'string' ? req.body.code : '';
  const previousInviteCode = process.env.PVZ_INVITE_CODE;
  const normalizedCode = normalizeInviteCode(code);
  const normalizedBuiltinCode = normalizeInviteCode(BUILTIN_INVITE_CODE);

  try {
    if (normalizedCode === normalizedBuiltinCode) {
      process.env.PVZ_INVITE_CODE = BUILTIN_INVITE_CODE;
    } else if (!previousInviteCode?.trim()) {
      process.env.PVZ_INVITE_CODE = BUILTIN_INVITE_CODE;
    }

    const payload = await claimInvite(code);
    res.status(200).json(payload);
  } catch (caught) {
    if (caught instanceof InvalidInviteCodeError) {
      res.status(401).json({ error: caught.message });
      return;
    }

    if (caught instanceof MissingDatabaseUrlError || caught instanceof ConfigMissingError) {
      res.status(500).json({ error: caught.message });
      return;
    }

    console.error(caught);
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  } finally {
    if (previousInviteCode === undefined) {
      delete process.env.PVZ_INVITE_CODE;
    } else {
      process.env.PVZ_INVITE_CODE = previousInviteCode;
    }
  }
}

function normalizeInviteCode(code: string) {
  return code.trim().replace(/\s+/g, '').toUpperCase();
}
