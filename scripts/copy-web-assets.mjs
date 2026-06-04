import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const assets = ['manifest.json', 'pwa-icon-192.png', 'pwa-icon-512.png', 'sw.js'];

await mkdir(join(root, 'dist'), { recursive: true });

await Promise.all(
  assets.map((asset) => copyFile(join(root, 'public', asset), join(root, 'dist', asset))),
);
