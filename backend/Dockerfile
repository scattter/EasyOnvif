# 构建阶段
FROM node:18-alpine AS builder

WORKDIR /app

# 复制 package.json
COPY package*.json ./
RUN npm ci

# 复制源代码
COPY . .

# 构建
RUN npm run build

# 生产阶段
FROM node:18-alpine

WORKDIR /app

# 安装 FFmpeg
RUN apk add --no-cache ffmpeg curl

# 复制 package.json
COPY package*.json ./
RUN npm ci --only=production

# 复制构建产物
COPY --from=builder /app/dist ./dist

# 创建存储目录
RUN mkdir -p storage/config storage/prebuffer storage/events

# 暴露端口
EXPOSE 3000

# 启动
CMD ["node", "dist/index.js"]
