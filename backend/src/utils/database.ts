import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { resolveStorageRoot } from './storage-path';

const DEFAULT_ADMIN_HASH = '$2b$10$yjD5lsafRbgNRORZn5Gx4.ufa5haC.wllhCZ9E9pyJ6udJm9QcagG';

let db: Database.Database | null = null;

function resolveDatabasePath(): string {
  return process.env.DB_PATH || path.join(resolveStorageRoot(), 'config/database.sqlite');
}

function bootstrapSchema(targetDb: Database.Database): void {
  targetDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      is_default_password BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS camera_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT DEFAULT '摄像头',
      ip TEXT NOT NULL,
      port INTEGER DEFAULT 80,
      username TEXT,
      password TEXT,
      rtsp_url TEXT,
      onvif_url TEXT,
      capabilities TEXT,
      motion_config TEXT,
      status TEXT DEFAULT 'disconnected',
      last_connected_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS recordings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      camera_id INTEGER,
      event_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      start_time DATETIME NOT NULL,
      end_time DATETIME,
      duration INTEGER,
      file_size BIGINT,
      file_path TEXT NOT NULL,
      thumbnail_path TEXT,
      is_deleted BOOLEAN DEFAULT 0,
      deleted_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (camera_id) REFERENCES camera_config(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      camera_id INTEGER,
      event_type TEXT NOT NULL,
      message TEXT,
      timestamp DATETIME NOT NULL,
      recording_id INTEGER,
      is_acknowledged BOOLEAN DEFAULT 0,
      acknowledged_at DATETIME,
      acknowledged_by INTEGER,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (camera_id) REFERENCES camera_config(id) ON DELETE SET NULL,
      FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE SET NULL,
      FOREIGN KEY (acknowledged_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      description TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS system_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      source TEXT,
      metadata TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function ensureCameraConfigColumns(targetDb: Database.Database): void {
  const tableInfo = targetDb.pragma('table_info(camera_config)') as Array<{ name: string }>;
  const existingColumns = new Set(tableInfo.map(column => column.name));
  const missingColumns = [
    { name: 'username', definition: 'TEXT' },
    { name: 'password', definition: 'TEXT' },
    { name: 'rtsp_url', definition: 'TEXT' },
    { name: 'onvif_url', definition: 'TEXT' },
    { name: 'capabilities', definition: 'TEXT' },
    { name: 'motion_config', definition: 'TEXT' },
    { name: 'status', definition: "TEXT DEFAULT 'disconnected'" },
    { name: 'last_connected_at', definition: 'DATETIME' },
    { name: 'created_at', definition: 'DATETIME DEFAULT CURRENT_TIMESTAMP' },
    { name: 'updated_at', definition: 'DATETIME DEFAULT CURRENT_TIMESTAMP' },
  ].filter(column => !existingColumns.has(column.name));

  for (const column of missingColumns) {
    targetDb.prepare(`ALTER TABLE camera_config ADD COLUMN ${column.name} ${column.definition}`).run();
  }
}

function createIndexes(targetDb: Database.Database): void {
  targetDb.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_camera_status ON camera_config(status);
    CREATE INDEX IF NOT EXISTS idx_recordings_event_type ON recordings(event_type);
    CREATE INDEX IF NOT EXISTS idx_recordings_start_time ON recordings(start_time);
    CREATE INDEX IF NOT EXISTS idx_recordings_camera_id ON recordings(camera_id);
    CREATE INDEX IF NOT EXISTS idx_recordings_is_deleted ON recordings(is_deleted);
    CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
    CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
    CREATE INDEX IF NOT EXISTS idx_events_camera_id ON events(camera_id);
    CREATE INDEX IF NOT EXISTS idx_events_is_ack ON events(is_acknowledged);
    CREATE INDEX IF NOT EXISTS idx_logs_level ON system_logs(level);
    CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON system_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_logs_source ON system_logs(source);
  `);
}

function seedDefaults(targetDb: Database.Database): void {
  targetDb
    .prepare(`
      INSERT OR IGNORE INTO users (id, username, password_hash, is_default_password)
      VALUES (1, 'admin', ?, 1)
    `)
    .run(DEFAULT_ADMIN_HASH);

  const defaultSettings: Array<[string, string, string]> = [
    ['storage.quota_gb', '50', '存储配额 (GB)'],
    ['storage.prebuffer_seconds', '10', '预录时长 (秒)'],
    ['storage.postbuffer_seconds', '60', '后录时长 (秒)'],
    ['storage.auto_cleanup', 'true', '自动清理'],
    ['storage.cleanup_threshold', '90', '清理阈值 (%)'],
    ['recording.quality', 'high', '录像质量'],
    ['recording.format', 'mp4', '录像格式'],
    ['system.timezone', 'Asia/Shanghai', '时区'],
    ['system.language', 'zh-CN', '语言'],
    ['events.subscriptions', 'motion,tampering,videoLoss', '订阅的事件类型'],
  ];

  const insertSetting = targetDb.prepare(`
    INSERT OR IGNORE INTO settings (key, value, description)
    VALUES (?, ?, ?)
  `);
  for (const setting of defaultSettings) {
    insertSetting.run(...setting);
  }
}

export function getDatabase(): Database.Database {
  if (!db) {
    const dbPath = resolveDatabasePath();
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    try {
      bootstrapSchema(db);
      ensureCameraConfigColumns(db);
      createIndexes(db);
      seedDefaults(db);
    } catch (error) {
      console.error('Database migration failed:', error);
      db.close();
      db = null;
      throw error;
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
