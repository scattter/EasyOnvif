# EasyONVIF - 家庭摄像头管理系统

一个简洁、现代化的单摄像头 ONVIF 监控管理系统，部署于 NAS 小主机，支持 PTZ 控制、事件触发录制和 WebRTC 实时播放。

## 功能特性

- **实时监控**: WebRTC 低延迟播放，支持主流浏览器
- **PTZ 控制**: 网页控制摄像头上下左右移动及变焦
- **智能录制**: 
  - 预录 10 秒（事件触发前）
  - 后录 60 秒（事件触发后）
  - 所有 ONVIF 事件均可触发录制
- **存储管理**: 
  - 默认 50GB 存储配额
  - 自动删除最旧录像，循环使用空间
- **安全认证**: JWT 账号系统，默认 admin/admin
- **录像回放**: 网页查看历史录像，时间轴浏览

## 快速开始

### 环境要求

- Docker & Docker Compose
- 支持 ONVIF 协议的 IP 摄像头
- NAS 小主机或其他 Linux 主机

### 部署步骤

1. 克隆项目
```bash
git clone <repository>
cd easy-onvif
```

2. 配置环境变量
```bash
cp .env.example .env
# 编辑 .env 文件，配置摄像头参数
```

3. 启动服务
```bash
docker-compose up -d
```

4. 访问系统
打开浏览器访问 `http://<主机IP>`
默认账号: `admin`
默认密码: `admin`

## GitHub 自动构建镜像与 Docker Compose 部署

### 1) 维护者：推送到 GitHub 后自动发布镜像

本仓库已支持 GitHub Actions 自动构建发布。当 `master` 分支有新提交时，会自动构建并推送：

- `ghcr.io/<仓库所有者>/easy-onvif-backend:latest`
- `ghcr.io/<仓库所有者>/easy-onvif-frontend:latest`

同时会生成 `sha-<commit>` 标签，便于回滚到指定版本。

首次使用前，请确认：

1. 代码已推送到 GitHub 仓库（默认分支是 `master`）。
2. 仓库 `Settings -> Actions -> General -> Workflow permissions` 允许 `Read and write permissions`。
3. 仓库 `Settings -> Packages` 或组织级设置允许发布 GHCR 包（建议镜像设为 public，便于用户免登录拉取）。

### 2) 用户：通过 docker compose 直接部署发布镜像

1. 获取项目文件
```bash
git clone <your-github-repo-url>
cd EasyOnvif
```

2. 准备环境变量
```bash
cp .env.example .env
```

在 `.env` 中至少配置：
```bash
# 镜像来源（使用发布版 compose）
IMAGE_REGISTRY=ghcr.io
IMAGE_NAMESPACE=<仓库所有者，如 your-github-username>
IMAGE_TAG=latest

# 摄像头与安全参数
CAMERA_IP=192.168.1.100
CAMERA_USERNAME=admin
CAMERA_PASSWORD=your_camera_password
CAMERA_RTSP_URL=rtsp://admin:your_camera_password@192.168.1.100:554/stream1
JWT_SECRET=change_this_to_random_string_32_chars
```

3. `docker-compose.release.yml` 示例（可直接保存为同名文件）
```yaml
services:
  backend:
    image: ${IMAGE_REGISTRY:-ghcr.io}/${IMAGE_NAMESPACE:?please-set-IMAGE_NAMESPACE}/easy-onvif-backend:${IMAGE_TAG:-latest}
    container_name: easy-onvif-backend
    restart: unless-stopped
    ports:
      - "${BACKEND_PORT:-3000}:3000"
    volumes:
      - ./storage:/app/storage
      - /etc/localtime:/etc/localtime:ro
    environment:
      - NODE_ENV=production
      - JWT_SECRET=${JWT_SECRET}
      - STORAGE_QUOTA_GB=${STORAGE_QUOTA_GB:-50}
      - PREBUFFER_SECONDS=${PREBUFFER_SECONDS:-10}
      - POSTBUFFER_SECONDS=${POSTBUFFER_SECONDS:-60}
      - CLEANUP_THRESHOLD=${CLEANUP_THRESHOLD:-90}
      - TZ=${TZ:-Asia/Shanghai}
      - LOG_LEVEL=${LOG_LEVEL:-info}
      - CAMERA_IP=${CAMERA_IP}
      - CAMERA_PORT=${CAMERA_PORT:-80}
      - CAMERA_USERNAME=${CAMERA_USERNAME}
      - CAMERA_PASSWORD=${CAMERA_PASSWORD}
      - CAMERA_RTSP_URL=${CAMERA_RTSP_URL}
    networks:
      - easy-onvif
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  mediamtx:
    image: bluenviron/mediamtx:latest
    container_name: easy-onvif-mediamtx
    restart: unless-stopped
    ports:
      - "${RTSP_PORT:-8554}:8554"
      - "${WEBRTC_PORT:-8889}:8889"
      - "8888:8888"
    volumes:
      - ./mediamtx.yml:/mediamtx.yml:ro
      - ./storage/events:/events:ro
      - /etc/localtime:/etc/localtime:ro
    environment:
      - CAMERA_RTSP_URL=${CAMERA_RTSP_URL}
    networks:
      - easy-onvif
    depends_on:
      - backend

  frontend:
    image: ${IMAGE_REGISTRY:-ghcr.io}/${IMAGE_NAMESPACE:?please-set-IMAGE_NAMESPACE}/easy-onvif-frontend:${IMAGE_TAG:-latest}
    container_name: easy-onvif-frontend
    restart: unless-stopped
    ports:
      - "${FRONTEND_PORT:-80}:80"
    environment:
      - VITE_API_URL=http://backend:3000
      - VITE_WEBRTC_URL=http://mediamtx:8889
    networks:
      - easy-onvif
    depends_on:
      - backend
      - mediamtx

networks:
  easy-onvif:
    driver: bridge

volumes:
  storage:
    driver: local
```

4. 启动服务（使用发布版镜像）
```bash
docker compose -f docker-compose.release.yml pull
docker compose -f docker-compose.release.yml up -d
```

5. 验证
- Web: `http://<主机IP>`
- API 健康检查: `http://<主机IP>:3000/api/health`

如果镜像是私有仓库，请先登录 GHCR：
```bash
docker login ghcr.io -u <github-username>
```

## 项目结构

```
easy-onvif/
├── docs/                  # 项目文档
│   ├── TECH_STACK.md      # 技术栈说明
│   ├── API_DESIGN.md      # API 设计文档
│   ├── DATABASE_SCHEMA.md # 数据库设计
│   └── DEPLOYMENT.md      # 部署指南
├── backend/               # 后端服务
│   ├── src/
│   │   ├── routes/        # API 路由
│   │   ├── services/      # 业务逻辑
│   │   ├── models/        # 数据模型
│   │   ├── middleware/    # 中间件
│   │   └── utils/         # 工具函数
│   ├── package.json
│   └── Dockerfile
├── frontend/              # 前端应用
│   ├── src/
│   │   ├── components/    # React 组件
│   │   ├── pages/         # 页面组件
│   │   ├── hooks/         # 自定义 Hooks
│   │   └── utils/         # 工具函数
│   ├── package.json
│   └── Dockerfile
├── storage/               # 数据存储
│   ├── config/            # 配置文件
│   ├── prebuffer/         # 预录缓冲
│   └── events/            # 事件录像
├── docker-compose.yml     # 容器编排
└── README.md
```

## 技术架构

```
┌────────────────────────────────────────────┐
│  Frontend (React + Vite + WebRTC)         │
│  - 登录页面                                 │
│  - 实时监控                                 │
│  - PTZ 控制                                 │
│  - 录像回放                                 │
└──────────────────┬─────────────────────────┘
                   │
┌──────────────────▼─────────────────────────┐
│  Backend (Node.js + Fastify + TypeScript) │
│  - JWT 认证                                 │
│  - ONVIF 控制 (PTZ + 事件)                 │
│  - 录制管理 (预录/后录/清理)               │
│  - 流管理 API                              │
└──────────────────┬─────────────────────────┘
                   │
┌──────────────────▼─────────────────────────┐
│  MediaMTX (Docker)                        │
│  - RTSP → WebRTC 转换                     │
└──────────────────┬─────────────────────────┘
                   │
┌──────────────────▼─────────────────────────┐
│  ONVIF Camera                             │
│  - RTSP 流                                 │
│  - PTZ 控制                                 │
│  - 事件推送                                 │
└────────────────────────────────────────────┘
```

## 开发计划

### Phase 1: 基础架构 (Day 1-2)
- [ ] 项目脚手架搭建
- [ ] Docker 环境配置
- [ ] 数据库迁移脚本

### Phase 2: 核心功能 (Day 3-6)
- [ ] ONVIF 设备接入
- [ ] RTSP 流转 WebRTC
- [ ] PTZ 控制接口

### Phase 3: 录制系统 (Day 7-9)
- [ ] 预录/后录机制
- [ ] 存储配额管理
- [ ] 自动清理逻辑

### Phase 4: 前端界面 (Day 10-12)
- [ ] 登录/认证
- [ ] 实时监控 + PTZ
- [ ] 录像列表/播放
- [ ] 系统设置

### Phase 5: 测试优化 (Day 13-14)
- [ ] 端到端测试
- [ ] 性能优化
- [ ] 文档完善

## 文档索引

- [技术栈说明](docs/TECH_STACK.md) - 详细技术选型说明
- [API 设计](docs/API_DESIGN.md) - RESTful API 规范
- [数据库设计](docs/DATABASE_SCHEMA.md) - SQLite Schema
- [部署指南](docs/DEPLOYMENT.md) - 详细部署步骤

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！

## 联系方式

如有问题，请通过 GitHub Issues 联系。
