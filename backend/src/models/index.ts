import { getDatabase } from '../utils/database';
import type { User, CameraConfig, Recording, Event, Setting } from '../types/database';

export const UserModel = {
  findByUsername(username: string): User | undefined {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
    const row = stmt.get(username) as any;
    if (!row) return undefined;
    return mapUserRow(row);
  },

  findById(id: number): User | undefined {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return undefined;
    return mapUserRow(row);
  },

  updatePassword(id: number, passwordHash: string): void {
    const db = getDatabase();
    const stmt = db.prepare(
      'UPDATE users SET password_hash = ?, is_default_password = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    );
    stmt.run(passwordHash, id);
  },
};

export const CameraModel = {
  getConfig(): CameraConfig | undefined {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM camera_config LIMIT 1');
    const row = stmt.get() as any;
    if (!row) return undefined;
    return mapCameraRow(row);
  },

  upsert(config: Partial<CameraConfig>): CameraConfig {
    const db = getDatabase();
    const existing = this.getConfig();
    
    if (existing) {
      const name = config.name !== undefined ? config.name : existing.name;
      const ip = config.ip !== undefined ? config.ip : existing.ip;
      const port = config.port !== undefined ? config.port : existing.port;
      const username = config.username !== undefined ? config.username : existing.username;
      const password = config.password !== undefined ? config.password : existing.password;
      const rtspUrl = config.rtspUrl !== undefined ? config.rtspUrl : existing.rtspUrl;
      const onvifUrl = config.onvifUrl !== undefined ? config.onvifUrl : existing.onvifUrl;
      const capabilities = config.capabilities !== undefined ? config.capabilities : existing.capabilities;
      const motionConfig = config.motionConfig !== undefined ? config.motionConfig : existing.motionConfig;
      const status = config.status !== undefined ? config.status : existing.status;
      const lastConnectedAt = config.lastConnectedAt !== undefined ? config.lastConnectedAt : existing.lastConnectedAt;

      const stmt = db.prepare(`
        UPDATE camera_config SET
          name = ?,
          ip = ?,
          port = ?,
          username = ?,
          password = ?,
          rtsp_url = ?,
          onvif_url = ?,
          capabilities = ?,
          motion_config = ?,
          status = ?,
          last_connected_at = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        RETURNING *
      `);
      const row = stmt.get(
        name ?? null,
        ip ?? null,
        port ?? null,
        username ?? null,
        password ?? null,
        rtspUrl ?? null,
        onvifUrl ?? null,
        capabilities ? JSON.stringify(capabilities) : null,
        motionConfig ? JSON.stringify(motionConfig) : null,
        status ?? null,
        lastConnectedAt ? lastConnectedAt.toISOString() : null,
        existing.id
      ) as any;
      return mapCameraRow(row);
    } else {
      const stmt = db.prepare(`
        INSERT INTO camera_config (name, ip, port, username, password, rtsp_url, onvif_url, capabilities, motion_config, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `);
      const row = stmt.get(
        config.name || '摄像头',
        config.ip,
        config.port || 80,
        config.username,
        config.password,
        config.rtspUrl,
        config.onvifUrl,
        config.capabilities ? JSON.stringify(config.capabilities) : null,
        config.motionConfig ? JSON.stringify(config.motionConfig) : null,
        config.status || 'disconnected'
      ) as any;
      return mapCameraRow(row);
    }
  },

  clearConfig(): void {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM camera_config');
    stmt.run();
  },
};

export const RecordingModel = {
  findAll(limit = 20, offset = 0): { items: Recording[]; total: number } {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM recordings WHERE is_deleted = 0 ORDER BY created_at DESC LIMIT ? OFFSET ?');
    const countStmt = db.prepare('SELECT COUNT(*) as total FROM recordings WHERE is_deleted = 0');
    
    const rows = stmt.all(limit, offset) as any[];
    const { total } = countStmt.get() as { total: number };
    
    return {
      items: rows.map(mapRecordingRow),
      total,
    };
  },

  findById(id: number): Recording | undefined {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM recordings WHERE id = ? AND is_deleted = 0');
    const row = stmt.get(id) as any;
    if (!row) return undefined;
    return mapRecordingRow(row);
  },

  create(recording: Partial<Recording>): Recording {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO recordings (camera_id, event_id, event_type, start_time, end_time, duration, file_size, file_path, thumbnail_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `);
    const row = stmt.get(
      recording.cameraId ?? null,
      recording.eventId ?? null,
      recording.eventType ?? null,
      recording.startTime instanceof Date ? recording.startTime.toISOString() : (recording.startTime ?? null),
      recording.endTime instanceof Date ? recording.endTime.toISOString() : (recording.endTime ?? null),
      recording.duration ?? null,
      recording.fileSize ?? null,
      recording.filePath ?? null,
      recording.thumbnailPath ?? null
    ) as any;
    return mapRecordingRow(row);
  },

  softDelete(id: number): void {
    const db = getDatabase();
    const stmt = db.prepare('UPDATE recordings SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE id = ?');
    stmt.run(id);
  },

  getStorageUsage(): number {
    const db = getDatabase();
    const stmt = db.prepare('SELECT COALESCE(SUM(file_size), 0) as total FROM recordings WHERE is_deleted = 0');
    const { total } = stmt.get() as { total: number };
    return total;
  },
};

export const EventModel = {
  create(event: Partial<Event>): Event {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO events (camera_id, event_type, message, timestamp, recording_id, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
      RETURNING *
    `);
    const row = stmt.get(
      event.cameraId ?? null,
      event.eventType ?? null,
      event.message ?? null,
      event.timestamp instanceof Date ? event.timestamp.toISOString() : (event.timestamp ?? null),
      event.recordingId ?? null,
      event.metadata ? JSON.stringify(event.metadata) : null
    ) as any;
    return mapEventRow(row);
  },

  updateRecordingId(eventId: number, recordingId: number): void {
    const db = getDatabase();
    const stmt = db.prepare('UPDATE events SET recording_id = ? WHERE id = ?');
    stmt.run(recordingId, eventId);
  },

  findAll(limit = 20, offset = 0): { items: Event[]; total: number } {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM events ORDER BY timestamp DESC LIMIT ? OFFSET ?');
    const countStmt = db.prepare('SELECT COUNT(*) as total FROM events');
    
    const rows = stmt.all(limit, offset) as any[];
    const { total } = countStmt.get() as { total: number };
    
    return {
      items: rows.map(mapEventRow),
      total,
    };
  },
};

export const SettingModel = {
  get(key: string): string | undefined {
    const db = getDatabase();
    const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
    const row = stmt.get(key) as any;
    return row?.value;
  },

  set(key: string, value: string): void {
    const db = getDatabase();
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)');
    stmt.run(key, value);
  },

  getAll(): Setting[] {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM settings');
    const rows = stmt.all() as any[];
    return rows.map(row => ({
      key: row.key,
      value: row.value,
      description: row.description,
      updatedAt: new Date(row.updated_at),
    }));
  },
};

// 映射函数
function mapUserRow(row: any): User {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    isDefaultPassword: !!row.is_default_password,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function mapCameraRow(row: any): CameraConfig {
  return {
    id: row.id,
    name: row.name,
    ip: row.ip,
    port: row.port,
    username: row.username,
    password: row.password,
    rtspUrl: row.rtsp_url,
    onvifUrl: row.onvif_url,
    capabilities: row.capabilities ? JSON.parse(row.capabilities) : { ptz: false, zoom: false, events: [] },
    motionConfig: row.motion_config ? JSON.parse(row.motion_config) : null,
    status: row.status,
    lastConnectedAt: row.last_connected_at ? new Date(row.last_connected_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function mapRecordingRow(row: any): Recording {
  return {
    id: row.id,
    cameraId: row.camera_id,
    eventId: row.event_id,
    eventType: row.event_type,
    startTime: new Date(row.start_time),
    endTime: row.end_time ? new Date(row.end_time) : null,
    duration: row.duration,
    fileSize: row.file_size,
    filePath: row.file_path,
    thumbnailPath: row.thumbnail_path,
    isDeleted: !!row.is_deleted,
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
    createdAt: new Date(row.created_at),
  };
}

function mapEventRow(row: any): Event {
  return {
    id: row.id,
    cameraId: row.camera_id,
    eventType: row.event_type,
    message: row.message,
    timestamp: new Date(row.timestamp),
    recordingId: row.recording_id,
    isAcknowledged: !!row.is_acknowledged,
    acknowledgedAt: row.acknowledged_at ? new Date(row.acknowledged_at) : null,
    acknowledgedBy: row.acknowledged_by,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
    createdAt: new Date(row.created_at),
  };
}
