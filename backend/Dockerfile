# 构建阶段
FROM node:18-alpine AS builder

WORKDIR /app

# Alpine 下部分原生依赖（如 better-sqlite3）在 arm64 需要本地编译
RUN apk add --no-cache python3 make g++

# 复制依赖定义文件
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# 复制源代码
COPY . .

# 构建
RUN yarn build

# 生产阶段
FROM node:18-alpine

WORKDIR /app

# 安装 FFmpeg
RUN apk add --no-cache ffmpeg curl

# 复制依赖定义文件
COPY package.json yarn.lock ./
# 生产依赖安装阶段同样需要编译工具，安装后清理以减小镜像体积
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
    && yarn install --production --frozen-lockfile \
    && yarn cache clean \
    && apk del .build-deps

# 复制构建产物
COPY --from=builder /app/dist ./dist

# 创建存储目录
RUN mkdir -p storage/config storage/prebuffer storage/events

# 暴露端口
EXPOSE 3000

# 启动
CMD ["node", "dist/index.js"]
