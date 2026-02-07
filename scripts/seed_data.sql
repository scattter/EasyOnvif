-- 插入初始数据

-- 默认用户 (密码: admin)
-- bcrypt hash for 'admin' with cost 12
INSERT OR IGNORE INTO users (id, username, password_hash, is_default_password) 
VALUES (1, 'admin', '$2b$10$yjD5lsafRbgNRORZn5Gx4.ufa5haC.wllhCZ9E9pyJ6udJm9QcagG', 1);

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
