import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { CameraModel, SettingModel } from '../models';
import { onvifService } from '../services/onvif';
import { recordingService } from '../services/recording';
import { MotionDetector } from '../services/motion';

const configSchema = z.object({
  name: z.string().min(1).optional(),
  ip: z.string().ip(),
  port: z.number().int().min(1).max(65535).default(80),
  username: z.preprocess(
    (value) => (value === '' ? null : value),
    z.string().nullable().optional()
  ),
  password: z.preprocess(
    (value) => (value === '' ? null : value),
    z.string().nullable().optional()
  ),
  rtspUrl: z.preprocess(
    (value) => (value === '' ? null : value),
    z.string().url().nullable().optional()
  ),
  onvifUrl: z.preprocess(
    (value) => (value === '' ? null : value),
    z.string().url().nullable().optional()
  ),
  motionConfig: z.object({
    enabled: z.boolean(),
    sensitivity: z.number().min(1).max(100),
    threshold: z.number().min(0).max(1).optional(), // Legacy or calculated
    regions: z.array(z.object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number()
    }))
  }).optional().nullable()
});

const testSchema = z.object({
  ip: z.string().ip(),
  port: z.number().int().min(1).max(65535).default(80),
  username: z.string().optional(),
  password: z.string().optional(),
});

const cameraPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // 获取配置
  fastify.get('/config', { preHandler: [fastify.authenticate] }, async (request, reply) => {
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

    return {
      success: true,
      data: {
        ...config,
        password: undefined, // 不返回密码
      },
    };
  });

  // 更新配置
  fastify.put('/config', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const data = configSchema.parse(request.body);
      const config = CameraModel.upsert(data as any); // zod inference might be partial match
      
      await recordingService.startPrebuffer();
      MotionDetector.getInstance().updateConfig();
      
      return {
        success: true,
        data: {
          ...config,
          password: undefined,
        },
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'INVALID_PARAMS',
            message: '参数错误',
            details: error.errors,
          },
        });
      }
      throw error;
    }
  });

  // 测试连接
  fastify.post('/test', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { ip, port, username, password } = testSchema.parse(request.body);
      
      const result = await onvifService.testConnection({
        ip,
        port,
        username,
        password,
      });

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'INVALID_PARAMS',
            message: '参数错误',
            details: error.errors,
          },
        });
      }
      
      return reply.status(500).send({
        success: false,
        error: {
          code: 'CONNECTION_FAILED',
          message: '连接失败',
          details: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });

  fastify.delete('/config', { preHandler: [fastify.authenticate] }, async () => {
    CameraModel.clearConfig();
    return { success: true };
  });
};

export const cameraRoutes = cameraPlugin;
