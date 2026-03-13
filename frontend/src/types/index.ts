export interface User {
  id: number;
  username: string;
  isDefaultPassword: boolean;
}

export interface CameraConfig {
  id: number;
  name: string;
  ip: string;
  port: number;
  rtspUrl: string | null;
  capabilities: {
    ptz: boolean;
    zoom: boolean;
    events: string[];
  };
  motionConfig: MotionConfig | null;
  status: 'connected' | 'disconnected' | 'error';
}

export interface MotionConfig {
  enabled: boolean;
  sensitivity: number;
  threshold?: number;
  regions: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}

export interface Recording {
  id: number;
  eventId: string;
  eventType: string;
  startTime: string;
  endTime: string | null;
  duration: number | null;
  fileSize: number | null;
  videoUrl: string;
  thumbnailUrl: string | null;
}

export interface Event {
  id: number;
  eventType: string;
  message: string | null;
  timestamp: string;
  recordingId: number | null;
}

export interface StorageStatus {
  quotaGB: number;
  usedGB: number;
  freeGB: number;
  usagePercent: number;
  recordingCount: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}
