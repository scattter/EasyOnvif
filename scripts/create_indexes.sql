-- 创建索引

-- users 表索引
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- camera_config 表索引
CREATE INDEX IF NOT EXISTS idx_camera_status ON camera_config(status);

-- recordings 表索引
CREATE INDEX IF NOT EXISTS idx_recordings_event_type ON recordings(event_type);
CREATE INDEX IF NOT EXISTS idx_recordings_start_time ON recordings(start_time);
CREATE INDEX IF NOT EXISTS idx_recordings_camera_id ON recordings(camera_id);
CREATE INDEX IF NOT EXISTS idx_recordings_is_deleted ON recordings(is_deleted);

-- events 表索引
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_camera_id ON events(camera_id);
CREATE INDEX IF NOT EXISTS idx_events_is_ack ON events(is_acknowledged);

-- system_logs 表索引
CREATE INDEX IF NOT EXISTS idx_logs_level ON system_logs(level);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON system_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_logs_source ON system_logs(source);
