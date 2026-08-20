import { createHash } from 'node:crypto';

import type { VercelRequest, VercelResponse } from '@vercel/node';

import {
  ConfigMissingError,
  InvalidInviteCodeError,
  InviteRateLimitError,
  MissingDatabaseUrlError,
  claimInvite,
} from '../_db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    return;
  }

  let code: string;

  try {
    code = readInviteCode(req.body);
  } catch {
    res.status(400).json({ error: 'BAD_REQUEST' });
    return;
  }

  try {
    const payload = await claimInvite(code, getClientKey(req));
    res.status(200).json(payload);
  } catch (caught) {
    if (caught instanceof InviteRateLimitError) {
      res.setHeader('Retry-After', String(caught.retryAfterSeconds));
      res.status(429).json({ error: 'RATE_LIMITED' });
      return;
    }

    if (caught instanceof InvalidInviteCodeError) {
      res.status(401).json({ error: caught.message });
      return;
    }

    if (caught instanceof MissingDatabaseUrlError || caught instanceof ConfigMissingError) {
      res.status(503).json({ error: caught.message });
      return;
    }

    console.error('[invite] claim failed', caught);
    res.status(500).json({ error: 'UNEXPECTED_ERROR' });
  }
}

function readInviteCode(body: unknown): string {
  let value = body;

  if (typeof value === 'string') {
    value = JSON.parse(value) as unknown;
  }

  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    typeof (value as { code?: unknown }).code !== 'string'
  ) {
    throw new Error('BAD_REQUEST');
  }

  const code = (value as { code: string }).code.trim();
  if (!code || code.length > 120) {
    throw new Error('BAD_REQUEST');
  }

  return code;
}

function getClientKey(req: VercelRequest): string {
  const forwarded = readHeader(req, 'x-vercel-forwarded-for') ?? readHeader(req, 'x-forwarded-for');
  const address = forwarded?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  return createHash('sha256').update(address.slice(0, 200)).digest('hex');
}

function readHeader(req: VercelRequest, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}
