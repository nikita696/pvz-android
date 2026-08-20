import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { createLocalSnapshotStore } from './domain/localSnapshot';
import type { AppState } from './domain/types';

const WEB_STORAGE_KEY = 'pvz.lastSuccessfulState';
const NATIVE_FILE_NAME = 'pvz-last-successful-state.json';

const store = createLocalSnapshotStore({
  async read() {
    if (Platform.OS === 'web') {
      return typeof window === 'undefined' ? null : window.localStorage.getItem(WEB_STORAGE_KEY);
    }

    const file = getNativeSnapshotFile();
    return file.exists ? file.text() : null;
  },

  async write(contents) {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(WEB_STORAGE_KEY, contents);
      }
      return;
    }

    const file = getNativeSnapshotFile();
    file.create({ overwrite: true, intermediates: true });
    file.write(contents);
  },

  async remove() {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(WEB_STORAGE_KEY);
      }
      return;
    }

    const file = getNativeSnapshotFile();
    if (file.exists) {
      file.delete();
    }
  },
});

export async function saveLastSuccessfulSnapshot(state: AppState, savedAt = new Date()) {
  return store.save(state, savedAt);
}

export async function loadLastSuccessfulSnapshot() {
  return store.load();
}

export async function clearLastSuccessfulSnapshot() {
  await store.clear();
}

function getNativeSnapshotFile() {
  return new File(Paths.document, NATIVE_FILE_NAME);
}
