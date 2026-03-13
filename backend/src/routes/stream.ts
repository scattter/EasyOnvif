import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import http from 'http';
import { CameraModel } from '../models';
import { StreamService } from '../services/stream';
import { onvifService } from '../services/onvif';

// 从请求中提取 token（支持 header 和 query 参数）
function extractToken(request: any): string | null {
  // 1. 从 Authorization header 提取
  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  // 2. 从 query 参数提取（用于 <img> 标签）
  const query = request.query as any;
  if (query.token) {
    return query.token;
  }
  
  return null;
}

// 常见摄像头品牌的 MJPEG 路径
const MJPEG_PATHS = [
  '/stream.jpg',                    // TP-Link 等
  '/cgi-bin/mjpg/video.cgi',        // 大华
  '/mjpg/video.mjpg',               // 通用
  '/video.cgi',                     // 通用
  '/mjpeg.cgi',                     // 通用
  '/cgi-bin/video.cgi',             // 通用
  '/live/stream.jpg',               // 某些型号
  '/snapshot.cgi',                  // D-Link 等
  '/image/jpeg.cgi',                // 某些型号
  '/onvif-http/snapshot',           // ONVIF Snapshot
];

// 构建带认证的 URL
function buildUrl(ip: string, port: number, path: string, username?: string | null, password?: string | null): string {
  if (username && password) {
    return `http://${username}:${password}@${ip}:${port}${path}`;
  }
  return `http://${ip}:${port}${path}`;
}

// 尝试获取 MJPEG 流
async function tryGetMjpegStream(
  ip: string, 
  port: number, 
  path: string, 
  username?: string | null, 
  password?: string | null,
  timeout: number = 5000
): Promise<{ success: boolean; response?: http.IncomingMessage; url: string }> {
  return new Promise((resolve) => {
    const url = buildUrl(ip, port, path, username, password);
    const urlObj = new URL(url);
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || port,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      timeout: timeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ...(username && password ? {
          'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
        } : {}),
      },
    };

    const req = http.request(options, (res) => {
      const contentType = res.headers['content-type'] || '';
      
      // 检查响应类型
      const isMjpeg = contentType.includes('multipart') || 
                      contentType.includes('mixed-replace') ||
                      contentType.includes('image/jpeg') ||
                      contentType.includes('image/jpg');
      
      if (res.statusCode === 200 && isMjpeg) {
        resolve({ success: true, response: res, url });
      } else {
        res.destroy();
        resolve({ success: false, url });
      }
    });

    req.on('error', () => {
      resolve({ success: false, url });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, url });
    });

    req.end();
  });
}

// 自动探测可用的 MJPEG 路径
async function discoverMjpegPath(
  ip: string, 
  port: number, 
  username?: string | null, 
  password?: string | null
): Promise<{ path: string; url: string } | null> {
  // 尝试所有路径
  for (const path of MJPEG_PATHS) {
    const result = await tryGetMjpegStream(ip, port, path, username, password, 3000);
    if (result.success) {
      result.response?.destroy();
      return { path, url: result.url };
    }
  }
  
  // 如果都失败了，返回第一个路径（可能稍后可用）
  return { path: MJPEG_PATHS[0], url: buildUrl(ip, port, MJPEG_PATHS[0], username, password) };
}

const streamPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // 修复：在中间件中使用 fastify 实例验证 JWT
  const authenticateStreamWithInstance = async (request: any, reply: any) => {
    try {
      const token = extractToken(request);
      
      if (!token) {
        reply.status(401).send({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: '请先登录',
          },
        });
        return;
      }
      
      // 使用 fastify 实例验证 JWT
      const decoded = await fastify.jwt.verify(token);
      request.user = decoded;
    } catch (err) {
      reply.status(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: '登录已过期，请重新登录',
        },
      });
      return;
    }
  };

  // 获取 WebSocket 流地址 (JSMpeg)
  fastify.get('/ws', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const config = CameraModel.getConfig();
    
    if (!config) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'CAMERA_NOT_FOUND',
          message: '摄像头未配置',
        },
      });
    }

    // Return the WebSocket URL for the stream
    const hostname = request.hostname.split(':')[0];
    const wsUrl = `ws://${hostname}:9999/stream/cam1`;
    
    return {
      success: true,
      data: {
        wsUrl,
        type: 'jsmpeg',
      },
    };
  });

  // 获取 MJPEG 流地址
  fastify.get('/mjpeg', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const config = CameraModel.getConfig();
    
    if (!config) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'CAMERA_NOT_FOUND',
          message: '摄像头未配置',
        },
      });
    }

    // 自动探测 MJPEG 路径
    const result = await discoverMjpegPath(
      config.ip,
      config.port || 80,
      config.username,
      config.password
    );
    
    return {
      success: true,
      data: {
        mjpegUrl: result?.url || buildUrl(config.ip, config.port || 80, MJPEG_PATHS[0], config.username, config.password),
        type: 'mjpeg',
        discovered: !!result,
      },
    };
  });

  // MJPEG 流代理（支持 URL token 参数，用于 <img> 标签）
  fastify.get('/mjpeg/stream', { preHandler: [authenticateStreamWithInstance] }, async (request, reply) => {
    const config = CameraModel.getConfig();
    
    if (!config) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'CAMERA_NOT_FOUND',
          message: '摄像头未配置',
        },
      });
    }

    try {
      // 自动探测可用的 MJPEG 路径
      const result = await discoverMjpegPath(
        config.ip,
        config.port || 80,
        config.username,
        config.password
      );

      if (!result) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'MJPEG_NOT_FOUND',
            message: '未找到可用的 MJPEG 流，摄像头可能不支持此功能',
          },
        });
      }

      request.log.info(`使用 MJPEG 路径: ${result.path}`);

      // 重新连接并转发流
      const urlObj = new URL(result.url);
      
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || config.port || 80,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          ...(config.username && config.password ? {
            'Authorization': 'Basic ' + Buffer.from(`${config.username}:${config.password}`).toString('base64')
          } : {}),
        },
      };

      return new Promise<void>((resolve, reject) => {
        const req = http.request(options, (res) => {
          // 设置响应头
          const contentType = res.headers['content-type'] || 'multipart/x-mixed-replace; boundary=--myboundary';
          reply.header('Content-Type', contentType);
          reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
          reply.header('Pragma', 'no-cache');
          reply.header('Expires', '0');
          
          // 转发数据流
          res.on('data', (chunk) => {
            try {
              reply.raw.write(chunk);
            } catch (err) {
              // 客户端断开连接
              res.destroy();
              resolve();
            }
          });

          res.on('end', () => {
            reply.raw.end();
            resolve();
          });

          res.on('error', (err) => {
            request.log.error({ err }, 'MJPEG 流错误');
            reject(err);
          });
        });

        req.on('error', (err) => {
          request.log.error({ err }, 'MJPEG 请求错误');
          reject(err);
        });

        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Request timeout'));
        });

        req.end();
      });
    } catch (error) {
      request.log.error({ err: error }, 'MJPEG 代理错误');
      return reply.status(500).send({
        success: false,
        error: {
          code: 'STREAM_ERROR',
          message: '无法连接到摄像头 MJPEG 流，请检查摄像头配置和网络连接',
        },
      });
    }
  });

  // Snapshot 代理（用于不支持 MJPEG 的摄像头，支持 URL token 参数）
  fastify.get('/snapshot', { preHandler: [authenticateStreamWithInstance] }, async (request, reply) => {
    const config = CameraModel.getConfig();
    
    if (!config) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'CAMERA_NOT_FOUND',
          message: '摄像头未配置',
        },
      });
    }

    // 支持从查询参数获取 IP 和端口（用于 snapshot 模式）
    const query = request.query as any;
    const ip = query.ip || config.ip;
    const port = parseInt(query.port) || config.port || 80;

    try {
      // 尝试常见的 snapshot 路径
      const snapshotPaths = [
        '/onvif-http/snapshot',           // ONVIF Snapshot
        '/cgi-bin/snapshot.cgi',          // 常见格式
        '/snapshot.cgi',                  // D-Link 等
        '/image/jpeg.cgi',                // 某些型号
        '/tmpfs/auto.jpg',                // 海康等
        '/snap.jpg',                      // 通用
        '/current.jpg',                   // 通用
        '/stream.jpg',                    // TP-Link（如果支持单张）
      ];

      // 尝试每个路径
      for (const path of snapshotPaths) {
        const url = buildUrl(ip, port, path, config.username, config.password);
        const urlObj = new URL(url);
        
        const options = {
          hostname: urlObj.hostname,
          port: urlObj.port || port,
          path: urlObj.pathname + urlObj.search,
          method: 'GET',
          timeout: 5000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            ...(config.username && config.password ? {
              'Authorization': 'Basic ' + Buffer.from(`${config.username}:${config.password}`).toString('base64')
            } : {}),
          },
        };

        try {
          const imageBuffer = await new Promise<Buffer>((resolve, reject) => {
            const req = http.request(options, (res) => {
              if (res.statusCode !== 200) {
                res.destroy();
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
              }

              const chunks: Buffer[] = [];
              res.on('data', (chunk) => chunks.push(chunk));
              res.on('end', () => resolve(Buffer.concat(chunks)));
              res.on('error', reject);
            });

            req.on('error', reject);
            req.on('timeout', () => {
              req.destroy();
              reject(new Error('Timeout'));
            });

            req.end();
          });

          // 检查是否是有效的图片
          const isJpeg = imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8;
          if (isJpeg) {
            request.log.info(`Snapshot 成功，使用路径: ${path}`);
            return reply
              .header('Content-Type', 'image/jpeg')
              .header('Cache-Control', 'no-cache, no-store, must-revalidate')
              .send(imageBuffer);
          }
        } catch (err) {
          // 继续尝试下一个路径
          continue;
        }
      }

      return reply.status(404).send({
        success: false,
        error: {
          code: 'SNAPSHOT_NOT_FOUND',
          message: '无法获取摄像头图片，请检查摄像头是否支持 snapshot 功能',
        },
      });
    } catch (error) {
      request.log.error({ err: error }, 'Snapshot 代理错误');
      return reply.status(500).send({
        success: false,
        error: {
          code: 'SNAPSHOT_ERROR',
          message: '获取图片失败',
        },
      });
    }
  });

  // 获取流状态
  fastify.get('/status', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const config = CameraModel.getConfig();
    const streamStatus = StreamService.getInstance().getStatus('cam1');
    const showFps = ((request.query as any)?.showFps ?? 'true') !== 'false';

    return {
      success: true,
      data: {
        isStreaming: streamStatus.isStreaming,
        viewers: streamStatus.viewers,
        type: 'jsmpeg',
        resolution: streamStatus.resolution ?? null,
        fps: showFps ? (streamStatus.fps ?? null) : null,
        bitrate: streamStatus.bitrate ?? null,
        zoomRatio: onvifService.getZoomRatio(),
      },
    };
  });
};

export const streamRoutes = streamPlugin;
