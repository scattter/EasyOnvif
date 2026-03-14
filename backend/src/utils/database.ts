import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { resolveStorageRoot } from './storage-path';

const DB_PATH = process.env.DB_PATH || path.join(resolveStorageRoot(), 'config/database.sqlite');

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // Check and migrate schema
    try {
      const tableInfo = db.pragma('table_info(camera_config)') as any[];
      const hasMotionConfig = tableInfo.some(col => col.name === 'motion_config');
      if (!hasMotionConfig) {
        console.log('Migrating database: Adding motion_config column to camera_config table...');
        db.prepare('ALTER TABLE camera_config ADD COLUMN motion_config TEXT').run();
      }
    } catch (error) {
      console.error('Database migration failed:', error);
    }
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
