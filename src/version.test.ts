import { describe, expect, it } from 'vitest';

import {
  compareAppVersions,
  evaluateAppVersion,
  parseAppVersionManifest,
} from './version';

describe('public app version manifest', () => {
  const manifest = parseAppVersionManifest({
    version: '1.2.0',
    minimumSupportedVersion: '1.1.0',
    publishedAt: '2026-08-03T00:00:00.000Z',
  });

  it('compares numeric version segments', () => {
    expect(compareAppVersions('1.10.0', '1.9.9')).toBe(1);
    expect(compareAppVersions('1.2', '1.2.0')).toBe(0);
    expect(compareAppVersions('1.1.9', '1.2.0')).toBe(-1);
  });

  it('distinguishes optional and required updates', () => {
    expect(evaluateAppVersion('1.1.5', manifest)).toMatchObject({
      updateAvailable: true,
      updateRequired: false,
    });
    expect(evaluateAppVersion('1.0.9', manifest)).toMatchObject({
      updateAvailable: true,
      updateRequired: true,
    });
  });

  it('rejects malformed public manifests', () => {
    expect(() => parseAppVersionManifest({ version: 'latest' })).toThrow('INVALID_VERSION_MANIFEST');
  });
});
