# 依赖安装阶段（使用 glibc 基础镜像，减少 alpine/musl 下原生依赖失败概率）
FROM node:18-bookworm-slim AS deps

WORKDIR /app

# 原生依赖构建工具链
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

ENV YARN_REGISTRY=https://registry.npmjs.org
ENV YARN_NETWORK_TIMEOUT=600000

# 复制依赖定义文件
COPY package.json yarn.lock ./
RUN set -eux; \
    yarn config set registry "${YARN_REGISTRY}"; \
    yarn config set network-timeout "${YARN_NETWORK_TIMEOUT}"; \
    for i in 1 2 3; do \
      yarn install --frozen-lockfile --non-interactive --network-timeout "${YARN_NETWORK_TIMEOUT}" && break; \
      if [ "$i" -eq 3 ]; then \
        echo "yarn install failed after ${i} attempts"; \
        exit 1; \
      fi; \
      echo "yarn install failed, retrying (${i}/3)..."; \
      sleep 10; \
    done

# 构建阶段
FROM deps AS builder

WORKDIR /app

# 复制源代码
COPY . .

# 构建
RUN yarn build

# 生产阶段
FROM node:18-bookworm-slim

WORKDIR /app

# 运行时依赖
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg curl \
    && rm -rf /var/lib/apt/lists/*

# 复用构建阶段已解析并编译好的依赖，避免生产阶段再次安装失败
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/node_modules ./node_modules

# 复制构建产物
COPY --from=builder /app/dist ./dist

# 创建存储目录
RUN mkdir -p storage/config storage/prebuffer storage/events

# 暴露端口
EXPOSE 3000

# 启动
CMD ["node", "dist/index.js"]
