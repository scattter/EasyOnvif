# API 设计文档

本文档定义 EasyONVIF 系统的 RESTful API 规范。

## 基础信息

- **基础 URL**: `/api`
- **协议**: HTTP (内部部署) / HTTPS (公网部署)
- **数据格式**: JSON
- **认证方式**: Bearer Token (JWT)

## 认证相关

### 登录

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin"
}
```

**响应:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "expiresIn": 900,
    "user": {
      "id": 1,
      "username": "admin"
    }
  }
}
```

### 刷新令牌

```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

### 登出

```http
POST /api/auth/logout
Authorization: Bearer <accessToken>
```

### 修改密码

```http
PUT /api/auth/password
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "currentPassword": "admin",
  "newPassword": "newpassword123"
}
```

## 摄像头管理

### 获取配置

```http
GET /api/camera/config
Authorization: Bearer <accessToken>
```

**响应:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "客厅摄像头",
    "ip": "192.168.1.100",
    "port": 80,
    "username": "admin",
    "rtspUrl": "rtsp://192.168.1.100:554/stream1",
    "capabilities": {
      "ptz": true,
      "zoom": true,
      "events": ["motion", "tampering"]
    },
    "status": "connected"
  }
}
```

### 更新配置

```http
PUT /api/camera/config
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "name": "客厅摄像头",
  "ip": "192.168.1.100",
  "port": 80,
  "username": "admin",
  "password": "camera_password",
  "rtspUrl": "rtsp://192.168.1.100:554/stream1"
}
```

### 测试连接

```http
POST /api/camera/test
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "ip": "192.168.1.100",
  "port": 80,
  "username": "admin",
  "password": "camera_password"
}
```

**响应:**
```json
{
  "success": true,
  "data": {
    "reachable": true,
    "onvifSupported": true,
    "capabilities": {
      "ptz": true,
      "zoom": true,
      "events": ["motion", "tampering"]
    }
  }
}
```

## PTZ 控制

### PTZ 移动

```http
POST /api/camera/ptz/move
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "direction": "left",
  "speed": 0.5
}
```

**参数说明:**
- `direction`: `up` | `down` | `left` | `right` | `stop`
- `speed`: 0.0 - 1.0 (移动速度)

### PTZ 缩放

```http
POST /api/camera/ptz/zoom
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "direction": "in",
  "speed": 0.3
}
```

**参数说明:**
- `direction`: `in` | `out` | `stop`
- `speed`: 0.0 - 1.0 (缩放速度)

### 获取预置位

```http
GET /api/camera/ptz/presets
Authorization: Bearer <accessToken>
```

**响应:**
```json
{
  "success": true,
  "data": [
    {
      "token": "1",
      "name": "门口",
      "position": { "x": 0.5, "y": 0.3, "z": 0 }
    }
  ]
}
```

### 前往预置位

```http
POST /api/camera/ptz/presets/{token}/goto
Authorization: Bearer <accessToken>
```

## 视频流

### 获取 WebRTC 播放地址

```http
GET /api/stream/webrtc
Authorization: Bearer <accessToken>
```

**响应:**
```json
{
  "success": true,
  "data": {
    "whepUrl": "http://localhost:8889/cameras/cam1/whep",
    "iceServers": [
      { "urls": "stun:stun.l.google.com:19302" }
    ]
  }
}
```

**说明:** 前端使用 WHEP 协议连接 WebRTC 流

### 获取流状态

```http
GET /api/stream/status
Authorization: Bearer <accessToken>
```

**响应:**
```json
{
  "success": true,
  "data": {
    "isStreaming": true,
    "viewers": 1,
    "bitrate": "2048 kbps",
    "resolution": "1920x1080",
    "fps": 25
  }
}
```

## 录制管理

### 获取录像列表

```http
GET /api/recordings?page=1&limit=20&startDate=2024-01-01&endDate=2024-12-31
Authorization: Bearer <accessToken>
```

**响应:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 1,
        "eventId": "evt_001",
        "eventType": "motion",
        "startTime": "2024-02-06T10:30:00Z",
        "endTime": "2024-02-06T10:31:10Z",
        "duration": 70,
        "fileSize": 15728640,
        "thumbnailUrl": "/api/recordings/1/thumbnail",
        "videoUrl": "/api/recordings/1/stream"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "totalPages": 8
    }
  }
}
```

### 获取录像详情

```http
GET /api/recordings/{id}
Authorization: Bearer <accessToken>
```

### 播放录像

```http
GET /api/recordings/{id}/stream
Authorization: Bearer <accessToken>
```

返回视频流 (MP4 格式)

### 获取缩略图

```http
GET /api/recordings/{id}/thumbnail
Authorization: Bearer <accessToken>
```

### 删除录像

```http
DELETE /api/recordings/{id}
Authorization: Bearer <accessToken>
```

### 批量删除

```http
POST /api/recordings/batch-delete
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "ids": [1, 2, 3]
}
```

## 事件管理

### 获取事件列表

```http
GET /api/events?page=1&limit=20&type=motion
Authorization: Bearer <accessToken>
```

**响应:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 1,
        "type": "motion",
        "message": "移动检测",
        "timestamp": "2024-02-06T10:30:00Z",
        "isRecorded": true,
        "recordingId": 1
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 50
    }
  }
}
```

### WebSocket 实时事件

```
WS /api/events/live
Authorization: Bearer <accessToken>
```

**消息格式:**
```json
{
  "type": "motion",
  "message": "移动检测",
  "timestamp": "2024-02-06T10:30:00Z",
  "source": "camera_1"
}
```

## 存储管理

### 获取存储状态

```http
GET /api/storage/status
Authorization: Bearer <accessToken>
```

**响应:**
```json
{
  "success": true,
  "data": {
    "quotaGB": 50,
    "usedGB": 23.5,
    "freeGB": 26.5,
    "usagePercent": 47,
    "recordingCount": 150,
    "oldestRecording": "2024-01-15T08:00:00Z"
  }
}
```

### 获取存储配置

```http
GET /api/storage/config
Authorization: Bearer <accessToken>
```

**响应:**
```json
{
  "success": true,
  "data": {
    "quotaGB": 50,
    "prebufferSeconds": 10,
    "postbufferSeconds": 60,
    "autoCleanup": true,
    "cleanupThreshold": 90
  }
}
```

### 更新存储配置

```http
PUT /api/storage/config
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "quotaGB": 100,
  "prebufferSeconds": 10,
  "postbufferSeconds": 60,
  "autoCleanup": true,
  "cleanupThreshold": 90
}
```

### 手动清理存储

```http
POST /api/storage/cleanup
Authorization: Bearer <accessToken>
```

**响应:**
```json
{
  "success": true,
  "data": {
    "deletedCount": 10,
    "freedSpace": 1073741824
  }
}
```

## 系统管理

### 获取系统状态

```http
GET /api/system/status
Authorization: Bearer <accessToken>
```

**响应:**
```json
{
  "success": true,
  "data": {
    "version": "1.0.0",
    "uptime": 86400,
    "cameraConnected": true,
    "streamActive": true,
    "recordingActive": true
  }
}
```

### 获取系统日志

```http
GET /api/system/logs?limit=100&level=error
Authorization: Bearer <accessToken>
```

## 错误响应格式

所有错误响应遵循以下格式:

```json
{
  "success": false,
  "error": {
    "code": "CAMERA_NOT_FOUND",
    "message": "摄像头未配置",
    "details": null
  }
}
```

### 错误码列表

| 错误码 | HTTP 状态码 | 说明 |
|--------|-------------|------|
| `UNAUTHORIZED` | 401 | 未登录或令牌过期 |
| `FORBIDDEN` | 403 | 权限不足 |
| `CAMERA_NOT_FOUND` | 404 | 摄像头未配置 |
| `CAMERA_OFFLINE` | 503 | 摄像头离线 |
| `PTZ_NOT_SUPPORTED` | 400 | 摄像头不支持 PTZ |
| `INVALID_PARAMS` | 400 | 参数错误 |
| `INTERNAL_ERROR` | 500 | 服务器内部错误 |
| `STORAGE_FULL` | 507 | 存储空间不足 |

## 分页规范

所有列表接口支持以下分页参数:

- `page`: 页码 (默认: 1)
- `limit`: 每页数量 (默认: 20, 最大: 100)

分页响应包含:

```json
{
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8,
    "hasNext": true,
    "hasPrev": false
  }
}
```

## 认证头

所有需要认证的接口必须在请求头中包含:

```
Authorization: Bearer <accessToken>
```

如果令牌过期或无效，返回 401 状态码:

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "令牌已过期"
  }
}
```
