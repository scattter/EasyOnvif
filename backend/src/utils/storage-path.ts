import fs from 'fs';
import path from 'path';

export function resolveStorageRoot(
  cwd: string = process.cwd(),
  storagePathFromEnv: string | undefined = process.env.STORAGE_PATH
): string {
  if (storagePathFromEnv) {
    return storagePathFromEnv;
  }

  const parentStorage = path.resolve(cwd, '../storage');
  const localStorage = path.resolve(cwd, 'storage');

  if (fs.existsSync(parentStorage)) {
    return parentStorage;
  }
  if (fs.existsSync(localStorage)) {
    return localStorage;
  }

  // Keep backward-compatible default for non-container local runs.
  return parentStorage;
}
