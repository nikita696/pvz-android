export const CURRENT_APP_VERSION = '1.0.2';

export type AppVersionManifest = {
  version: string;
  minimumSupportedVersion: string;
  publishedAt: string;
};

export type AppVersionCheck = {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  updateRequired: boolean;
  publishedAt: string;
};

export function parseAppVersionManifest(value: unknown): AppVersionManifest {
  if (!isRecord(value)) {
    throw new Error('INVALID_VERSION_MANIFEST');
  }

  const version = readVersion(value.version);
  const minimumSupportedVersion = readVersion(value.minimumSupportedVersion);
  const publishedAt = typeof value.publishedAt === 'string' && !Number.isNaN(Date.parse(value.publishedAt))
    ? new Date(value.publishedAt).toISOString()
    : null;

  if (!version || !minimumSupportedVersion || !publishedAt) {
    throw new Error('INVALID_VERSION_MANIFEST');
  }

  return { version, minimumSupportedVersion, publishedAt };
}

export function evaluateAppVersion(
  currentVersion: string,
  manifest: AppVersionManifest,
): AppVersionCheck {
  const current = readVersion(currentVersion);

  if (!current) {
    throw new Error('INVALID_CURRENT_VERSION');
  }

  return {
    currentVersion: current,
    latestVersion: manifest.version,
    updateAvailable: compareAppVersions(current, manifest.version) < 0,
    updateRequired: compareAppVersions(current, manifest.minimumSupportedVersion) < 0,
    publishedAt: manifest.publishedAt,
  };
}

export function compareAppVersions(first: string, second: string): number {
  const firstParts = parseVersionParts(first);
  const secondParts = parseVersionParts(second);

  for (let index = 0; index < Math.max(firstParts.length, secondParts.length); index += 1) {
    const difference = (firstParts[index] ?? 0) - (secondParts[index] ?? 0);
    if (difference !== 0) {
      return difference > 0 ? 1 : -1;
    }
  }

  return 0;
}

function readVersion(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d+(?:\.\d+){0,3}$/.test(value.trim())) {
    return null;
  }

  return value.trim();
}

function parseVersionParts(value: string): number[] {
  const version = readVersion(value);

  if (!version) {
    throw new Error('INVALID_VERSION');
  }

  return version.split('.').map(Number);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
