import { FastifyInstance } from 'fastify';
import fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import dotenv from 'dotenv';
import path from 'path';
import fastifyStatic from '@fastify/static';
import { authRoutes } from './routes/auth';
import { cameraRoutes } from './routes/camera';
import { ptzRoutes } from './routes/ptz';
import { streamRoutes } from './routes/stream';
import { recordingRoutes } from './routes/recording';
import { eventRoutes } from './routes/event';
import { storageRoutes } from './routes/storage';
import { systemRoutes } from './routes/system';
import { discoveryRoutes } from './routes/discovery';
import { errorHandler } from './middleware/error';
import authPlugin from './plugins/auth';
import { StreamService } from './services/stream';
import { onvifService } from './services/onvif';
import { recordingService } from './services/recording';
import { MotionDetector } from './services/motion';
import { SettingModel } from './models';

dotenv.config();

const app: FastifyInstance = fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV === 'development' ? {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    } : undefined,
  },
});

// 注册插件
async function registerPlugins() {
  // CORS
  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  // JWT
  await app.register(jwt, {
    secret: process.env.JWT_SECRET || 'default-secret-key-change-it',
    sign: {
      expiresIn: '15m',
    },
  });

  // Swagger (API文档)
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'EasyONVIF API',
        description: '家庭摄像头管理系统 API',
        version: '1.0.0',
      },
      security: [
        {
          bearerAuth: [],
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/documentation',
  });

  // Serve static files (storage)
  // Serve at /public/storage so we can access recordings directly
  await app.register(fastifyStatic, {
    root: path.join(process.cwd(), '../storage'),
    prefix: '/public/storage/',
    decorateReply: false // Avoid conflict if other plugins use decorateReply
  });

  // Auth decorator
  await app.register(authPlugin);
}

// 注册路由
async function registerRoutes() {
  // 公开路由
  await app.register(authRoutes, { prefix: '/api/auth' });
  
  // 健康检查
  app.get('/api/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // 需要认证的路由
  await app.register(cameraRoutes, { prefix: '/api/camera' });
  await app.register(ptzRoutes, { prefix: '/api/camera/ptz' });
  await app.register(streamRoutes, { prefix: '/api/stream' });
  await app.register(recordingRoutes, { prefix: '/api/recordings' });
  await app.register(eventRoutes, { prefix: '/api/events' });
  await app.register(storageRoutes, { prefix: '/api/storage' });
  await app.register(systemRoutes, { prefix: '/api/system' });
  await app.register(discoveryRoutes, { prefix: '/api/discovery' });
}

// 错误处理
app.setErrorHandler(errorHandler);

// 启动服务器
async function start() {
  try {
    await registerPlugins();
    await registerRoutes();

    StreamService.getInstance().init(9999);
    await recordingService.startPrebuffer();
    
    // Start Software Motion Detector
    const motionDetector = MotionDetector.getInstance();
    motionDetector.on('motion', () => {
      recordingService.handleMotionEvent({
        message: 'Motion detected (Software Analysis)',
        source: 'MotionDetector',
      }).catch(err => app.log.error(err));
    });
    motionDetector.start();

    // ONVIF Event Listener disabled in favor of software motion detection
    /*
    await onvifService.startEventListener((event: any) => {
      const subscriptions = (SettingModel.get('events.subscriptions') || '')
        .split(',')
        .map(item => item.trim().toLowerCase())
        .filter(Boolean);
      const allowMotion = subscriptions.length === 0 || subscriptions.includes('motion');
      if (!allowMotion) {
        return;
      }
      const text = JSON.stringify(event).toLowerCase();
      const isMotion = ['motion', 'cellmotion', 'motionalarm', 'videomotion'].some(keyword =>
        text.includes(keyword)
      );
      if (!isMotion) {
        return;
      }
      recordingService.handleMotionEvent({
        message: 'motion',
        payload: event,
      }).catch(() => {});
    });
    */

    const port = parseInt(process.env.PORT || '3000', 10);
    const host = process.env.HOST || '0.0.0.0';

    await app.listen({ port, host });
    app.log.info(`Server listening on ${host}:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
