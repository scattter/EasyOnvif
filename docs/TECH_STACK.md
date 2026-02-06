# 技术栈说明

本文档详细说明 EasyONVIF 系统的技术选型理由和版本要求。

## 后端技术栈

### 核心框架

| 技术 | 版本 | 说明 |
|------|------|------|
| Node.js | >= 18.x | 运行时环境 |
| TypeScript | ^5.3 | 类型安全 |
| Fastify | ^4.x | Web 框架 |

**选型理由:**
- **Fastify vs Express**: Fastify 性能更好 (2x Express)，支持异步/等待，内置 JSON Schema 验证
- **TypeScript**: 编译时类型检查，更好的 IDE 支持，减少运行时错误

### 数据库与存储

| 技术 | 版本 | 说明 |
|------|------|------|
| SQLite3 | ^5.x | 轻量级数据库 |
| better-sqlite3 | ^9.x | 同步 SQLite 驱动 (更快) |

**选型理由:**
- **SQLite**: 零配置，单文件存储，适合 NAS 部署
- **better-sqlite3**: 比 sqlite3 快 10-20 倍，支持同步 API

### 认证与安全

| 技术 | 版本 | 说明 |
|------|------|------|
| @fastify/jwt | ^7.x | JWT 认证 |
| bcrypt | ^5.x | 密码哈希 |
| helmet | ^7.x | 安全响应头 |

### ONVIF 与媒体处理

| 技术 | 版本 | 说明 |
|------|------|------|
| node-onvif | ^0.7 | ONVIF 协议库 |
| fluent-ffmpeg | ^2.x | FFmpeg 封装 |
| node-schedule | ^2.x | 定时任务 (存储清理) |

### 开发工具

| 技术 | 版本 | 说明 |
|------|------|------|
| nodemon | ^3.x | 开发热重载 |
| ts-node | ^10.x | TypeScript 运行 |
| vitest | ^1.x | 单元测试 |
| @types/* | latest | TypeScript 类型定义 |

## 前端技术栈

### 核心框架

| 技术 | 版本 | 说明 |
|------|------|------|
| React | ^18.x | UI 框架 |
| TypeScript | ^5.3 | 类型安全 |
| Vite | ^5.x | 构建工具 |

**选型理由:**
- **Vite vs CRA**: 更快的冷启动，即时 HMR，优化的构建输出
- **React 18**: 并发特性，自动批处理，Suspense 改进

### UI 组件库

| 技术 | 版本 | 说明 |
|------|------|------|
| TailwindCSS | ^3.x | 原子化 CSS |
| Headless UI | ^1.x | 无样式组件 |
| Lucide React | ^0.x | 图标库 |

**选型理由:**
- **TailwindCSS**: 快速开发，小体积，无需维护 CSS 文件
- **Headless UI**: 可访问性良好，完全可定制样式

### 状态管理与数据获取

| 技术 | 版本 | 说明 |
|------|------|------|
| Zustand | ^4.x | 状态管理 |
| TanStack Query | ^5.x | 服务端状态管理 |
| Axios | ^1.x | HTTP 客户端 |

**选型理由:**
- **Zustand**: 比 Redux 简单，无样板代码，TypeScript 友好
- **TanStack Query**: 自动缓存、重试、分页，减少样板代码

### WebRTC 播放

| 技术 | 版本 | 说明 |
|------|------|------|
| react-player | ^2.x | 媒体播放器 |
| 或原生 WebRTC | - | 直接对接 MediaMTX |

### 开发工具

| 技术 | 版本 | 说明 |
|------|------|------|
| ESLint | ^8.x | 代码检查 |
| Prettier | ^3.x | 代码格式化 |
| TypeScript | ^5.3 | 类型检查 |

## 基础设施

### 容器化

| 技术 | 版本 | 说明 |
|------|------|------|
| Docker | >= 20.x | 容器引擎 |
| Docker Compose | >= 2.x | 编排工具 |

### 流媒体服务器

| 技术 | 版本 | 说明 |
|------|------|------|
| MediaMTX | >= 1.x | 原 go2rtc |

**功能:**
- RTSP 流接收
- WebRTC 输出
- HLS/FLV 备用输出
- 低延迟 (<500ms)

### 反向代理 (可选)

| 技术 | 版本 | 说明 |
|------|------|------|
| Nginx | latest | 静态文件服务 |
| Caddy | latest | 自动 HTTPS (公网部署) |

## 开发环境要求

### 必备软件

- **Node.js**: 18.x LTS 或更高
- **pnpm** (推荐) 或 npm: 包管理
- **Docker & Docker Compose**: 服务运行
- **FFmpeg**: 媒体处理 (容器中已包含)

### 推荐 IDE

- **VS Code** + 扩展:
  - ESLint
  - Prettier
  - Tailwind CSS IntelliSense
  - TypeScript Importer

## 性能指标目标

| 指标 | 目标值 |
|------|--------|
| 视频延迟 | < 1秒 (WebRTC) |
| 首屏加载 | < 3秒 |
| API 响应 | < 200ms (P95) |
| PTZ 延迟 | < 500ms |
| 并发用户 | 10+ (家庭场景) |

## 兼容性

### 支持的浏览器

- Chrome >= 90
- Firefox >= 88
- Safari >= 14
- Edge >= 90

### 支持的 ONVIF 版本

- ONVIF Profile S (视频流)
- ONVIF Profile T (高级视频)
- ONVIF PTZ Service
- ONVIF Event Service

## 安全考虑

1. **JWT 令牌**: 
   - 访问令牌 15 分钟过期
   - 刷新令牌 7 天过期
   - 支持令牌黑名单

2. **密码安全**:
   - bcrypt 哈希 (cost factor: 12)
   - 强制首次登录修改默认密码

3. **API 安全**:
   - Helmet 响应头保护
   - Rate limiting (100 req/min)
   - CORS 白名单

4. **文件安全**:
   - 录像文件路径验证
   - 防止目录遍历攻击

## 扩展性设计

虽然当前为单摄像头设计，但架构支持未来扩展:

- 数据库模型预留 camera_id 字段
- ONVIF 服务可管理多个设备
- 存储路径按摄像头分区
- API 路由支持多设备筛选

## 参考资源

- [Fastify 文档](https://www.fastify.io/docs/latest/)
- [MediaMTX 文档](https://github.com/bluenviron/mediamtx)
- [ONVIF 规范](https://www.onvif.org/profiles/)
- [WebRTC 指南](https://webrtc.org/getting-started/)
