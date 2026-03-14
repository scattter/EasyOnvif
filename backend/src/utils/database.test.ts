import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { CameraModel } from '../models';
import { closeDatabase, getDatabase } from './database';

const originalDbPath = process.env.DB_PATH;
const tempDirs: string[] = [];

function withTempDbPath(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'easyonvif-db-'));
  tempDirs.push(tempDir);
  const dbPath = path.join(tempDir, 'database.sqlite');
  process.env.DB_PATH = dbPath;
  return dbPath;
}

afterEach(() => {
  closeDatabase();
  if (originalDbPath === undefined) {
    delete process.env.DB_PATH;
  } else {
    process.env.DB_PATH = originalDbPath;
  }
  for (const tempDir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe('database bootstrap', () => {
  it('creates required tables on a fresh database', () => {
    const dbPath = withTempDbPath();
    expect(fs.existsSync(dbPath)).toBe(false);

    const db = getDatabase();
    expect(fs.existsSync(dbPath)).toBe(true);

    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'camera_config'")
      .get() as { name?: string } | undefined;

    expect(row?.name).toBe('camera_config');
    expect(() => CameraModel.getConfig()).not.toThrow();
  });

  it('adds motion_config column for existing camera_config table', () => {
    const dbPath = withTempDbPath();
    const setupDb = new Database(dbPath);
    setupDb
      .prepare(
        `CREATE TABLE camera_config (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT,
          ip TEXT NOT NULL,
          port INTEGER
        )`
      )
      .run();
    setupDb.close();

    const db = getDatabase();
    const tableInfo = db.pragma('table_info(camera_config)') as Array<{ name: string }>;

    expect(tableInfo.some(column => column.name === 'motion_config')).toBe(true);
  });
});
