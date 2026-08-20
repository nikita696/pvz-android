import {
  parseWorkspaceBackup,
  serializeWorkspaceBackup,
  type WorkspaceBackup,
} from './backup';
import type { AppState } from './types';

export type LocalSnapshotStorageAdapter = {
  read: () => Promise<string | null>;
  write: (contents: string) => Promise<void>;
  remove: () => Promise<void>;
};

export type LocalSnapshotStore = {
  clear: () => Promise<void>;
  load: () => Promise<WorkspaceBackup | null>;
  save: (state: AppState, savedAt?: Date) => Promise<WorkspaceBackup>;
};

/**
 * Small adapter boundary so persistence is testable without a browser or a
 * native filesystem. Corrupt snapshots are discarded instead of preventing
 * the live server state from loading.
 */
export function createLocalSnapshotStore(adapter: LocalSnapshotStorageAdapter): LocalSnapshotStore {
  return {
    async clear() {
      await adapter.remove();
    },

    async load() {
      const contents = await adapter.read();

      if (!contents) {
        return null;
      }

      try {
        return parseWorkspaceBackup(contents);
      } catch {
        await adapter.remove();
        return null;
      }
    },

    async save(state, savedAt = new Date()) {
      const contents = serializeWorkspaceBackup(state, savedAt);
      await adapter.write(contents);
      return parseWorkspaceBackup(contents);
    },
  };
}
