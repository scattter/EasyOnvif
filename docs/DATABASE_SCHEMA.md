# 数据库 Schema 设计

本文档定义 SQLite 数据库表结构。

## 概述

- **数据库**: SQLite3
- **文件位置**: `storage/config/database.sqlite`
- **驱动**: better-sqlite3 (同步，高性能)
- **迁移管理**: 使用 `db-migrate` 或自定义脚本

## ER 图

```
┌─────────────────┐       ┌──────────────────┐
│     users       │       │  camera_config   │
├─────────────────┤       ├──────────────────┤
│ PK id           │       │ PK id            │
│    username     │       │    name          │
│    password_hash│       │    ip            │
│    created_at   │       │    port          │
└─────────────────┘       │    username      │
                          │    password      │
                          │    rtsp_url      │
                          │    capabilities  │
                          │    created_at    │
                          └──────────────────┘
                                    │
                                    │ FK
                                    ▼
                          ┌──────────────────┐
                          │   recordings     │
                          ├──────────────────┤
                          │ PK id            │
                          │ FK camera_id     │
                          │    event_id      │
                          │    event_type    │
                          │    start_time    │
                          │    end_time      │
                          │    duration      │
                          │    file_size     │
                          │    file_path     │
                          │    thumbnail_path│
                          │    is_deleted    │
                          │    created_at    │
                          └──────────────────┘
                                    │
                                    │ FK
                                    ▼
                          ┌──────────────────┐
                          │     events       │
                          ├──────────────────┤
                          │ PK id            │
                          │ FK camera_id     │
                          │    event_type    │
                          │    message       │
                          │    timestamp     │
                          │ FK recording_id  │
                          │    is_ack        │
                          │    created_at    │
                          └──────────────────┘

┌─────────────────┐
│    settings     │
├─────────────────┤
│ PK key          │
│    value        │
│    updated_at   │
└─────────────────┘

┌─────────────────┐
│ system_logs     │
├─────────────────┤
│ PK id           │
│    level        │
│    message      │
│    metadata     │
│    timestamp    │
└─────────────────┘
```

## 表结构

### 1. users (用户表)

存储系统用户信息。

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  is_default_password BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX idx_users_username ON users(username);

-- 初始数据
INSERT INTO users (username, password_hash, is_default_password) 
VALUES ('admin', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewKyNiAYMyzJ/I3O', 1);
-- 密码: admin (bcrypt 哈希)
```

**字段说明:**
- `id`: 主键
- `username`: 用户名，唯一
- `password_hash`: bcrypt 哈希后的密码
- `is_default_password`: 是否为默认密码 (首次登录需修改)
- `created_at`: 创建时间
- `updated_at`: 更新时间

### 2. camera_config (摄像头配置表)

存储 ONVIF 摄像头配置信息。

```sql
CREATE TABLE camera_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT DEFAULT '摄像头',
  ip TEXT NOT NULL,
  port INTEGER DEFAULT 80,
  username TEXT,
  password TEXT,
  rtsp_url TEXT,
  onvif_url TEXT,
  capabilities TEXT,  -- JSON: {"ptz": true, "zoom": true, "events": [...]}
  status TEXT DEFAULT 'disconnected',  -- connected, disconnected, error
  last_connected_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX idx_camera_status ON camera_config(status);
```

**字段说明:**
- `name`: 摄像头名称
- `ip`: 摄像头 IP 地址
- `port`: ONVIF 端口
- `username/password`: ONVIF 认证凭据
- `rtsp_url`: RTSP 流地址
- `onvif_url`: ONVIF 服务地址
- `capabilities`: JSON 格式，存储支持的功能
- `status`: 连接状态
- `last_connected_at`: 上次连接时间

### 3. recordings (录像记录表)

存储事件触发录制的元数据。

```sql
CREATE TABLE recordings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  camera_id INTEGER,
  event_id TEXT NOT NULL,  -- 唯一事件标识
  event_type TEXT NOT NULL,  -- motion, tampering, etc.
  start_time DATETIME NOT NULL,
  end_time DATETIME,
  duration INTEGER,  -- 秒
  file_size BIGINT,  -- 字节
  file_path TEXT NOT NULL,
  thumbnail_path TEXT,
  is_deleted BOOLEAN DEFAULT 0,
  deleted_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (camera_id) REFERENCES camera_config(id) ON DELETE SET NULL
);

-- 索引
CREATE INDEX idx_recordings_event_type ON recordings(event_type);
CREATE INDEX idx_recordings_start_time ON recordings(start_time);
CREATE INDEX idx_recordings_camera_id ON recordings(camera_id);
CREATE INDEX idx_recordings_is_deleted ON recordings(is_deleted);
```

**字段说明:**
- `event_id`: 唯一事件标识符 (如: evt_20240206_103000_001)
- `event_type`: 事件类型 (motion, tampering, videoLoss, etc.)
- `start_time`: 录像开始时间 (包含预录 10s)
- `end_time`: 录像结束时间 (包含后录 60s)
- `duration`: 录像总时长 (秒)
- `file_size`: 文件大小 (字节)
- `file_path`: 相对于 storage/events/ 的路径
- `thumbnail_path`: 缩略图路径
- `is_deleted`: 软删除标记
- `deleted_at`: 删除时间

### 4. events (事件记录表)

存储 ONVIF 事件日志。

```sql
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  camera_id INTEGER,
  event_type TEXT NOT NULL,
  message TEXT,
  timestamp DATETIME NOT NULL,
  recording_id INTEGER,
  is_acknowledged BOOLEAN DEFAULT 0,  -- 是否已确认
  acknowledged_at DATETIME,
  acknowledged_by INTEGER,
  metadata TEXT,  -- JSON: 事件原始数据
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (camera_id) REFERENCES camera_config(id) ON DELETE SET NULL,
  FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE SET NULL,
  FOREIGN KEY (acknowledged_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 索引
CREATE INDEX idx_events_type ON events(event_type);
CREATE INDEX idx_events_timestamp ON events(timestamp);
CREATE INDEX idx_events_camera_id ON events(camera_id);
CREATE INDEX idx_events_is_ack ON events(is_acknowledged);
```

**字段说明:**
- `event_type`: ONVIF 事件类型
- `message`: 事件描述
- `timestamp`: 事件发生时间
- `recording_id`: 关联的录像记录
- `is_acknowledged`: 是否已查看/确认
- `metadata`: 原始 ONVIF 事件数据 (JSON)

### 5. settings (系统设置表)

键值对存储系统配置。

```sql
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  description TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 初始配置
INSERT INTO settings (key, value, description) VALUES
('storage.quota_gb', '50', '存储配额 (GB)'),
('storage.prebuffer_seconds', '10', '预录时长 (秒)'),
('storage.postbuffer_seconds', '60', '后录时长 (秒)'),
('storage.auto_cleanup', 'true', '自动清理'),
('storage.cleanup_threshold', '90', '清理阈值 (%)'),
('recording.quality', 'high', '录像质量'),
('recording.format', 'mp4', '录像格式'),
('system.timezone', 'Asia/Shanghai', '时区'),
('system.language', 'zh-CN', '语言'),
('events.subscriptions', 'motion,tampering,videoLoss', '订阅的事件类型');
```

**配置项说明:**

| Key | Value | 说明 |
|-----|-------|------|
| `storage.quota_gb` | 50 | 存储配额上限 |
| `storage.prebuffer_seconds` | 10 | 预录时长 |
| `storage.postbuffer_seconds` | 60 | 后录时长 |
| `storage.auto_cleanup` | true | 是否自动清理 |
| `storage.cleanup_threshold` | 90 | 触发清理的使用率阈值 |
| `recording.quality` | high | 录像质量 (high/medium/low) |
| `recording.format` | mp4 | 录像格式 |
| `events.subscriptions` | motion,tampering,videoLoss | 订阅的事件 |

### 6. system_logs (系统日志表)

系统运行日志。

```sql
CREATE TABLE system_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level TEXT NOT NULL,  -- debug, info, warn, error
  message TEXT NOT NULL,
  source TEXT,  -- 日志来源模块
  metadata TEXT,  -- JSON
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX idx_logs_level ON system_logs(level);
CREATE INDEX idx_logs_timestamp ON system_logs(timestamp);
CREATE INDEX idx_logs_source ON system_logs(source);
```

## 数据库初始化脚本

```sql
-- init.sql
-- 执行顺序很重要!

-- 1. 创建表
.read create_tables.sql

-- 2. 创建索引
.read create_indexes.sql

-- 3. 插入初始数据
.read seed_data.sql

-- 4. 验证
SELECT 'Database initialized successfully' AS status;
```

create_tables.sql:
```sql
-- users
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  is_default_password BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- camera_config
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

-- recordings
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

-- events
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

-- settings
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  description TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- system_logs
CREATE TABLE IF NOT EXISTS system_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  source TEXT,
  metadata TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

create_indexes.sql:
```sql
-- users
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- camera_config
CREATE INDEX IF NOT EXISTS idx_camera_status ON camera_config(status);

-- recordings
CREATE INDEX IF NOT EXISTS idx_recordings_event_type ON recordings(event_type);
CREATE INDEX IF NOT EXISTS idx_recordings_start_time ON recordings(start_time);
CREATE INDEX IF NOT EXISTS idx_recordings_camera_id ON recordings(camera_id);
CREATE INDEX IF NOT EXISTS idx_recordings_is_deleted ON recordings(is_deleted);

-- events
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_camera_id ON events(camera_id);
CREATE INDEX IF NOT EXISTS idx_events_is_ack ON events(is_acknowledged);

-- system_logs
CREATE INDEX IF NOT EXISTS idx_logs_level ON system_logs(level);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON system_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_logs_source ON system_logs(source);
```

seed_data.sql:
```sql
-- 默认用户 (密码: admin)
INSERT OR IGNORE INTO users (id, username, password_hash, is_default_password) 
VALUES (1, 'admin', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewKyNiAYMyzJ/I3O', 1);

-- 默认设置
INSERT OR IGNORE INTO settings (key, value, description) VALUES
('storage.quota_gb', '50', '存储配额 (GB)'),
('storage.prebuffer_seconds', '10', '预录时长 (秒)'),
('storage.postbuffer_seconds', '60', '后录时长 (秒)'),
('storage.auto_cleanup', 'true', '自动清理'),
('storage.cleanup_threshold', '90', '清理阈值 (%)'),
('recording.quality', 'high', '录像质量'),
('recording.format', 'mp4', '录像格式'),
('system.timezone', 'Asia/Shanghai', '时区'),
('system.language', 'zh-CN', '语言'),
('events.subscriptions', 'motion,tampering,videoLoss', '订阅的事件类型');
```

## 数据模型 TypeScript 类型

```typescript
// types/database.ts

export interface User {
  id: number;
  username: string;
  passwordHash: string;
  isDefaultPassword: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CameraConfig {
  id: number;
  name: string;
  ip: string;
  port: number;
  username: string | null;
  password: string | null;
  rtspUrl: string | null;
  onvifUrl: string | null;
  capabilities: CameraCapabilities;
  status: 'connected' | 'disconnected' | 'error';
  lastConnectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CameraCapabilities {
  ptz: boolean;
  zoom: boolean;
  events: string[];
  presets?: number;
}

export interface Recording {
  id: number;
  cameraId: number | null;
  eventId: string;
  eventType: string;
  startTime: Date;
  endTime: Date | null;
  duration: number | null;
  fileSize: number | null;
  filePath: string;
  thumbnailPath: string | null;
  isDeleted: boolean;
  deletedAt: Date | null;
  createdAt: Date;
}

export interface Event {
  id: number;
  cameraId: number | null;
  eventType: string;
  message: string | null;
  timestamp: Date;
  recordingId: number | null;
  isAcknowledged: boolean;
  acknowledgedAt: Date | null;
  acknowledgedBy: number | null;
  metadata: Record<string, any> | null;
  createdAt: Date;
}

export interface Setting {
  key: string;
  value: string;
  description: string | null;
  updatedAt: Date;
}

export interface SystemLog {
  id: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  source: string | null;
  metadata: Record<string, any> | null;
  timestamp: Date;
}
```

## 备份策略

由于使用 SQLite，备份简单:

```bash
# 创建备份
cp storage/config/database.sqlite storage/config/database.backup.$(date +%Y%m%d).sqlite

# 备份录像
tar -czf storage/events/backup.$(date +%Y%m%d).tar.gz storage/events/
```

建议:
- 数据库: 每日自动备份
- 录像: 按事件保留，自动清理旧文件

## 性能优化

1. **索引**: 所有查询字段都有索引
2. **软删除**: recordings 表使用软删除，避免物理删除影响性能
3. **分页**: 所有列表查询强制分页
4. **定期清理**: 定期清理旧的 system_logs (保留 30 天)
