# 部署指南

详细的部署步骤和配置说明。

## 系统要求

### 硬件要求

| 配置项 | 最低要求 | 推荐配置 |
|--------|----------|----------|
| CPU | 4核 ARM/x86 | 4核+ |
| 内存 | 2GB | 4GB+ |
| 存储 | 50GB | 100GB+ SSD |
| 网络 | 100Mbps | 1000Mbps |

### 软件要求

- **操作系统**: Linux (Debian/Ubuntu/CentOS/Alpine)
- **Docker**: >= 20.10.0
- **Docker Compose**: >= 2.0.0
- **FFmpeg**: >= 4.0 (Docker 镜像已包含)

## 快速部署

### 1. 安装 Docker

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker

# 验证
docker --version
docker compose version
```

### 2. 下载项目

```bash
# 创建目录
mkdir -p ~/easy-onvif
cd ~/easy-onvif

# 下载项目文件 (假设已发布到 GitHub)
git clone https://github.com/yourusername/easy-onvif.git .

# 或使用 wget 下载 release
wget https://github.com/yourusername/easy-onvif/releases/download/v1.0.0/easy-onvif-v1.0.0.tar.gz
tar -xzf easy-onvif-v1.0.0.tar.gz
cd easy-onvif
```

### 3. 配置环境

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑配置
nano .env
```

.env 示例:
```bash
# 摄像头配置
CAMERA_IP=192.168.1.100
CAMERA_PORT=80
CAMERA_USERNAME=admin
CAMERA_PASSWORD=your_camera_password
CAMERA_RTSP_URL=rtsp://192.168.1.100:554/stream1

# JWT 密钥 (请修改为随机字符串)
JWT_SECRET=your_random_jwt_secret_key_here

# 存储配额 (GB)
STORAGE_QUOTA_GB=50

# 时区
TZ=Asia/Shanghai
```

### 4. 启动服务

```bash
# 拉取镜像并启动
docker compose up -d

# 查看日志
docker compose logs -f

# 查看状态
docker compose ps
```

### 5. 访问系统

打开浏览器访问: `http://<你的NAS IP>`

默认账号:
- 用户名: `admin`
- 密码: `admin`

**⚠️ 首次登录后请立即修改默认密码!**

## 目录结构说明

部署后的目录结构:

```
~/easy-onvif/
├── docker-compose.yml          # Docker 编排文件
├── .env                        # 环境变量 (需配置)
├── .env.example                # 环境变量模板
├── backend/                     # 后端代码
│   ├── Dockerfile
│   └── ...
├── frontend/                    # 前端代码
│   ├── Dockerfile
│   └── ...
├── mediamtx.yml                # MediaMTX 配置
└── storage/                     # 数据存储 (自动创建)
    ├── config/
    │   └── database.sqlite     # SQLite 数据库
    ├── prebuffer/              # 预录缓冲
    │   └── rolling.mp4
    └── events/                 # 事件录像
        └── 2024-02-06/
            └── event_xxx.mp4
```

## 详细配置

### Docker Compose 配置

```yaml
version: '3.8'

services:
  backend:
    build: ./backend
    container_name: easy-onvif-backend
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - ./storage:/app/storage
      - /etc/localtime:/etc/localtime:ro
    environment:
      - NODE_ENV=production
      - JWT_SECRET=${JWT_SECRET}
      - STORAGE_QUOTA_GB=${STORAGE_QUOTA_GB:-50}
      - TZ=${TZ:-Asia/Shanghai}
      - CAMERA_IP=${CAMERA_IP}
      - CAMERA_PORT=${CAMERA_PORT:-80}
      - CAMERA_USERNAME=${CAMERA_USERNAME}
      - CAMERA_PASSWORD=${CAMERA_PASSWORD}
      - CAMERA_RTSP_URL=${CAMERA_RTSP_URL}
    networks:
      - easy-onvif

  mediamtx:
    image: bluenviron/mediamtx:latest
    container_name: easy-onvif-mediamtx
    restart: unless-stopped
    ports:
      - "8554:8554"      # RTSP
      - "8889:8889"      # WebRTC
      - "8888:8888"      # HLS/FLV
    volumes:
      - ./mediamtx.yml:/mediamtx.yml
      - /etc/localtime:/etc/localtime:ro
    networks:
      - easy-onvif

  frontend:
    build: ./frontend
    container_name: easy-onvif-frontend
    restart: unless-stopped
    ports:
      - "80:80"
    depends_on:
      - backend
    networks:
      - easy-onvif

networks:
  easy-onvif:
    driver: bridge
```

### MediaMTX 配置

mediamtx.yml:
```yaml
# 全局设置
logLevel: info
logDestinations: [stdout]

# RTSP 设置
rtsp: true
rtspAddress: :8554
rtspTransport: tcp

# WebRTC 设置 (主要)
webrtc: true
webrtcAddress: :8889
webrtcLocalUDPAddress: :8189
webrtcLocalTCPAddress: :8189
webrtcIPsFromInterfaces: []
webrtcAdditionalHosts: []
webrtcICEUDPMuxAddress: :8189
webrtcICETCPMuxAddress: :8189

# HLS 设置 (备用)
hls: true
hlsAddress: :8888
hlsAlwaysRemux: false
hlsVariant: fmp4

# 路径配置
paths:
  # 摄像头流
  cam1:
    source: ${CAMERA_RTSP_URL}
    sourceProtocol: tcp
    sourceOnDemand: false
    
  # 录像回放
  recording:
    source: publisher
    sourceOnDemand: true
```

### 存储配置

存储目录权限:
```bash
# 创建目录并设置权限
mkdir -p storage/{config,prebuffer,events}
chmod -R 755 storage

# 如果使用非 root 用户运行
csudo chown -R 1000:1000 storage
```

## 高级配置

### 1. 反向代理 (Nginx)

如果需要使用域名访问，配置 Nginx:

```nginx
server {
    listen 80;
    server_name camera.yourdomain.com;
    
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name camera.yourdomain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    # 前端
    location / {
        proxy_pass http://localhost:80;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    # API
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    # WebSocket (事件)
    location /api/events/live {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
    
    # MediaMTX WebRTC
    location /webrtc {
        proxy_pass http://localhost:8889;
        proxy_http_version 1.1;
    }
}
```

### 2. 自动启动

配置系统服务:

```bash
# 创建 systemd 服务
sudo nano /etc/systemd/system/easy-onvif.service
```

内容:
```ini
[Unit]
Description=EasyONVIF Camera System
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/youruser/easy-onvif
ExecStart=/usr/local/bin/docker compose up -d
ExecStop=/usr/local/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

启用服务:
```bash
sudo systemctl daemon-reload
sudo systemctl enable easy-onvif
sudo systemctl start easy-onvif
```

### 3. 自动备份

创建备份脚本:

```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/mnt/backup/easy-onvif"
DATE=$(date +%Y%m%d_%H%M%S)

# 创建备份目录
mkdir -p "$BACKUP_DIR"

# 备份数据库
cp storage/config/database.sqlite "$BACKUP_DIR/db_$DATE.sqlite"

# 压缩备份
xz "$BACKUP_DIR/db_$DATE.sqlite"

# 清理 7 天前的备份
find "$BACKUP_DIR" -name "db_*.sqlite.xz" -mtime +7 -delete

echo "Backup completed: db_$DATE.sqlite.xz"
```

添加到 crontab:
```bash
# 每天凌晨 3 点备份
0 3 * * * /home/youruser/easy-onvif/scripts/backup.sh >> /var/log/easy-onvif-backup.log 2>&1
```

## 故障排除

### 常见问题

#### 1. 无法连接到摄像头

检查步骤:
```bash
# 1. 检查网络连通性
ping $CAMERA_IP

# 2. 检查 ONVIF 端口
telnet $CAMERA_IP $CAMERA_PORT

# 3. 查看后端日志
docker compose logs backend -f

# 4. 验证 ONVIF 配置
docker compose exec backend npm run test:onvif
```

#### 2. 视频流无法播放

检查步骤:
```bash
# 1. 检查 MediaMTX 状态
docker compose logs mediamtx -f

# 2. 检查 RTSP 流
docker compose exec mediamtx ffmpeg -rtsp_transport tcp -i rtsp://camera_ip/stream -t 5 -f null -

# 3. 检查 WebRTC 端口
curl http://localhost:8889/cam1/whep
```

#### 3. 存储空间不足

处理步骤:
```bash
# 1. 查看存储使用情况
docker compose exec backend npm run storage:status

# 2. 手动清理旧录像
docker compose exec backend npm run storage:cleanup

# 3. 增加存储配额
# 编辑 .env 文件，增加 STORAGE_QUOTA_GB
docker compose up -d
```

#### 4. 性能问题

优化建议:
- 降低录像分辨率: 在摄像头设置中调整
- 降低帧率: 从 25fps 降到 15fps
- 使用硬件加速: 如果 NAS 支持
- 增加内存: 如果频繁 OOM

## 升级维护

### 升级系统

```bash
# 1. 进入目录
cd ~/easy-onvif

# 2. 拉取最新代码
git pull origin main

# 3. 重新构建
docker compose down
docker compose build --no-cache
docker compose up -d

# 4. 清理旧镜像
docker image prune -f
```

### 查看日志

```bash
# 所有服务
docker compose logs -f

# 仅后端
docker compose logs -f backend

# 仅 MediaMTX
docker compose logs -f mediamtx

# 按时间查看
docker compose logs --since 1h backend
```

### 重置系统

⚠️ **警告: 这将删除所有数据!**

```bash
docker compose down -v
rm -rf storage/*
docker compose up -d
```

## 安全建议

1. **修改默认密码**: 首次登录后立即修改
2. **使用强 JWT 密钥**: 生成随机字符串
3. **防火墙配置**: 仅开放必要端口
   - 80 (HTTP)
   - 443 (HTTPS，如果使用)
   - 3000 (后端，建议不对外)
4. **定期更新**: 关注安全更新
5. **内网部署**: 不建议直接暴露到公网

## 支持

- GitHub Issues: https://github.com/yourusername/easy-onvif/issues
- 文档: https://docs.easy-onvif.com
- 邮件: support@easy-onvif.com
