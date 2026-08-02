import * as DocumentPicker from 'expo-document-picker';
import { File as ExpoFile, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { parseWorkspaceBackup, serializeWorkspaceBackup, type WorkspaceBackup } from './domain/backup';
import type { AppState } from './domain/types';

export async function exportWorkspaceBackup(state: AppState): Promise<string> {
  const fileName = `pvz-backup-${formatFileDate(new Date())}.json`;
  const contents = serializeWorkspaceBackup(state);

  if (Platform.OS === 'web') {
    const blob = new Blob([contents], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = fileName;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    globalThis.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    return fileName;
  }

  const file = new ExpoFile(Paths.cache, fileName);
  file.create({ overwrite: true, intermediates: true });
  file.write(contents);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('На этом устройстве нет приложения для сохранения файла.');
  }

  await Sharing.shareAsync(file.uri, {
    dialogTitle: 'Сохранить резервную копию ПВЗ',
    mimeType: 'application/json',
    UTI: 'public.json',
  });

  return fileName;
}

export async function pickWorkspaceBackup(): Promise<WorkspaceBackup | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/json', 'text/plain'],
    copyToCacheDirectory: true,
    multiple: false,
    base64: false,
  });

  if (result.canceled) {
    return null;
  }

  const asset = result.assets[0];
  const contents = Platform.OS === 'web' && asset.file
    ? await asset.file.text()
    : await new ExpoFile(asset.uri).text();

  return parseWorkspaceBackup(contents);
}

function formatFileDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}
