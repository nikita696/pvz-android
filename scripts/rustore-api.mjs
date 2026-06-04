import { createSign } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const API_BASE_URL = 'https://public-api.rustore.ru';

function readEnvFile(path) {
  const envPath = resolve(path);

  if (!existsSync(envPath)) {
    return;
  }

  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separator = trimmed.indexOf('=');
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator);
    const value = trimmed.slice(separator + 1);
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function readLocalEnv() {
  readEnvFile('.secrets/rustore.env');
  readEnvFile('.env.local');
}

function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function formatTimestamp(date = new Date()) {
  return date.toISOString();
}

function createSignature({ keyId, privateKey, timestamp }) {
  const message = `${keyId}${timestamp}`;
  const privateKeyDer = Buffer.from(privateKey, 'base64');
  const signer = createSign('RSA-SHA512');
  signer.update(message);
  signer.end();

  return signer.sign({ key: privateKeyDer, format: 'der', type: 'pkcs8' }, 'base64');
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, options);
  const text = await response.text();

  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }

  return { ok: response.ok, status: response.status, body };
}

async function getToken() {
  readLocalEnv();

  const keyId = requireEnv('RUSTORE_KEY_ID');
  const privateKey = requireEnv('RUSTORE_PRIVATE_KEY');
  const timestamp = formatTimestamp();
  const signature = createSignature({ keyId, privateKey, timestamp });
  const response = await request('/public/auth/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyId, timestamp, signature }),
  });

  if (!response.ok || response.body?.code !== 'OK' || !response.body?.body?.jwe) {
    throw new Error(`RuStore auth failed (${response.status}): ${JSON.stringify(response.body)}`);
  }

  return response.body.body.jwe;
}

async function callApi(path, options = {}) {
  const token = await getToken();
  const headers = new Headers(options.headers ?? {});
  headers.set('Public-Token', token);

  return request(path, { ...options, headers });
}

async function main() {
  const command = process.argv[2] ?? 'auth';

  if (command === 'auth') {
    await getToken();
    console.log('RuStore auth OK');
    return;
  }

  if (command === 'versions') {
    readLocalEnv();
    const packageName = requireEnv('RUSTORE_PACKAGE_NAME');
    const response = await callApi(`/public/v1/application/${encodeURIComponent(packageName)}/version`);
    console.log(JSON.stringify({ status: response.status, body: response.body }, null, 2));
    return;
  }

  if (command === 'draft') {
    readLocalEnv();
    const packageName = requireEnv('RUSTORE_PACKAGE_NAME');
    const contactEmail = requireEnv('RUSTORE_CONTACT_EMAIL');
    const body = {
      appName: 'PVZ',
      appType: 'MAIN',
      categories: ['business'],
      ageLegal: '3+',
      shortDescription: 'Трекер смен и выплат для пункта выдачи.',
      fullDescription:
        'PVZ Android помогает вести календарь смен сотрудников, считать выплаты, фиксировать комментарии к дням и видеть задолженность по зарплате.',
      whatsNew: 'Первый релиз приложения для учета смен и выплат.',
      moderInfo: 'Внутренний рабочий инструмент для учета смен.',
      publishType: 'MANUAL',
      minAndroidVersion: 8,
      developerContacts: [{ email: contactEmail, website: 'https://pvz-android.vercel.app' }],
    };
    const response = await callApi(`/public/v1/application/${encodeURIComponent(packageName)}/version`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    console.log(JSON.stringify({ status: response.status, body: response.body }, null, 2));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
