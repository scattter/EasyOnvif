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
  motionConfig: MotionConfig | null;
  status: 'connected' | 'disconnected' | 'error';
  lastConnectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MotionConfig {
  enabled: boolean;
  sensitivity: number; // 1-100
  threshold: number; // 1-100
  regions: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
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
