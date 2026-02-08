import axios from 'axios';
import { useAuthStore } from '../store/auth';
import type { ApiResponse, PaginatedResponse } from '../types';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);

// 认证相关
export const authApi = {
  login: (username: string, password: string) =>
    api.post<ApiResponse<{ accessToken: string; user: { id: number; username: string; isDefaultPassword: boolean } }>>('/auth/login', { username, password }),
  
  logout: () =>
    api.post<ApiResponse<void>>('/auth/logout'),
  
  changePassword: (currentPassword: string, newPassword: string) =>
    api.put<ApiResponse<void>>('/auth/password', { currentPassword, newPassword }),
  
  getMe: () =>
    api.get<ApiResponse<{ id: number; username: string; isDefaultPassword: boolean }>>('/auth/me'),
};

// 摄像头相关
export const cameraApi = {
  getConfig: () =>
    api.get<ApiResponse<any>>('/camera/config'),
  
  updateConfig: (config: { name?: string | null; ip: string; port?: number; username?: string | null; password?: string | null; rtspUrl?: string | null; onvifUrl?: string | null }) =>
    api.put<ApiResponse<any>>('/camera/config', config),
  
  testConnection: (config: { ip: string; port?: number; username?: string; password?: string }) =>
    api.post<ApiResponse<{ reachable: boolean; onvifSupported: boolean; capabilities: { ptz: boolean; zoom: boolean; events: string[] } }>>('/camera/test', config),

  deleteConfig: () =>
    api.delete<ApiResponse<void>>('/camera/config'),
};

// PTZ 控制
export const ptzApi = {
  move: (direction: 'up' | 'down' | 'left' | 'right' | 'stop', speed?: number) =>
    api.post<ApiResponse<void>>('/camera/ptz/move', { direction, speed }),
  
  zoom: (direction: 'in' | 'out' | 'stop', speed?: number) =>
    api.post<ApiResponse<void>>('/camera/ptz/zoom', { direction, speed }),
  
  getPresets: () =>
    api.get<ApiResponse<Array<{ token: string; name: string }>>>('/camera/ptz/presets'),
  
  gotoPreset: (token: string) =>
    api.post<ApiResponse<void>>(`/camera/ptz/presets/${token}/goto`),
};

// 流相关
export const streamApi = {
  getWebRTCUrl: () =>
    api.get<ApiResponse<{ whepUrl: string; iceServers: any[] }>>('/stream/webrtc'),
  
  getMjpegUrl: () =>
    api.get<ApiResponse<{ mjpegUrl: string; type: string }>>('/stream/mjpeg'),
  
  getWsUrl: () =>
    api.get<ApiResponse<{ wsUrl: string; type: string }>>('/stream/ws'),

  getStatus: (options?: { showFps?: boolean }) =>
    api.get<ApiResponse<{ isStreaming: boolean; viewers: number; type: string; resolution: string | null; fps: number | null; bitrate: string | null; zoomRatio: number }>>('/stream/status', {
      params: { showFps: options?.showFps },
    }),
};

// 录像相关
export const recordingApi = {
  getList: (page = 1, limit = 20) =>
    api.get<ApiResponse<PaginatedResponse<any>>>('/recordings', { params: { page, limit } }),
  
  getById: (id: number) =>
    api.get<ApiResponse<any>>(`/recordings/${id}`),
  
  delete: (id: number) =>
    api.delete<ApiResponse<void>>(`/recordings/${id}`),
  
  batchDelete: (ids: number[]) =>
    api.post<ApiResponse<void>>('/recordings/batch-delete', { ids }),
};

// 存储相关
export const storageApi = {
  getStatus: () =>
    api.get<ApiResponse<{ quotaGB: number; usedGB: number; freeGB: number; usagePercent: number; recordingCount: number }>>('/storage/status'),
  
  getConfig: () =>
    api.get<ApiResponse<{ quotaGB: number; prebufferSeconds: number; postbufferSeconds: number; autoCleanup: boolean; cleanupThreshold: number }>>('/storage/config'),
  
  updateConfig: (config: Partial<{ quotaGB: number; prebufferSeconds: number; postbufferSeconds: number; autoCleanup: boolean; cleanupThreshold: number }>) =>
    api.put<ApiResponse<void>>('/storage/config', config),
  
  cleanup: () =>
    api.post<ApiResponse<{ deletedCount: number; freedSpace: number }>>('/storage/cleanup'),
};

// 发现相关
export const discoveryApi = {
  scanNetwork: () =>
    api.post<ApiResponse<{ count: number, devices: Array<{
      ip: string;
      port: number;
      onvifUrl: string;
      manufacturer?: string;
      model?: string;
      serialNumber?: string;
      firmwareVersion?: string;
    }> } >>('/discovery/scan', { mode: 'network' }),

  scanRange: (startIp: string, endIp: string, port?: number) =>
    api.post<ApiResponse<{ count: number; devices: Array<{
      ip: string;
      port: number;
      onvifUrl: string;
    }> } >>('/discovery/scan', { mode: 'range', startIp, endIp, port }),

  testSingle: (ip: string, port?: number, username?: string, password?: string) =>
    api.post<ApiResponse<{ count: number; devices: Array<{
      ip: string;
      port: number;
      onvifUrl: string;
    }> } >>('/discovery/scan', { mode: 'single', ip, port, username, password }),

  getStreamUri: (ip: string, port: number, onvifUrl: string, username?: string, password?: string) =>
    api.post<ApiResponse<{ rtspUrl: string }>>('/discovery/stream-uri', { ip, port, onvifUrl, username, password }),

  getMjpegUrl: (ip: string, port: number, username?: string, password?: string) =>
    api.post<ApiResponse<{ mjpegUrl: string }>>('/discovery/mjpeg-url', { ip, port, username, password }),

  configure: (data: {
    ip: string;
    port: number;
    onvifUrl: string;
    username?: string;
    password?: string;
    name?: string;
  }) =>
    api.post<ApiResponse<any>>('/discovery/configure', data),

  autoDiscover: (ip: string, port?: number, username?: string, password?: string) =>
    api.post<ApiResponse<{ message: string; device: any; info: any }>>('/discovery/auto-discover', { ip, port, username, password }),
};

export default api;
