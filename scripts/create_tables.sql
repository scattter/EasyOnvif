-- 创建表结构
-- 注意: 执行顺序很重要!

-- 1. users 表
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  is_default_password BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. camera_config 表
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
  status TEXT DEFAULT 'disconnected',
  last_connected_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. recordings 表
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

-- 4. events 表
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

-- 5. settings 表
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  description TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 6. system_logs 表
CREATE TABLE IF NOT EXISTS system_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  source TEXT,
  metadata TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
