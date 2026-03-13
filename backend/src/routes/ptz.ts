import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { onvifService } from '../services/onvif';

const moveSchema = z.object({
  direction: z.enum(['up', 'down', 'left', 'right', 'stop']),
  speed: z.number().min(0).max(1).default(0.5),
});

const zoomSchema = z.object({
  direction: z.enum(['in', 'out', 'stop']),
  speed: z.number().min(0).max(1).default(0.3),
});

const ptzPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // PTZ 移动
  fastify.post('/move', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { direction, speed } = moveSchema.parse(request.body);
      
      await onvifService.ptzMove(direction, speed);
      
      return { success: true };
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
          code: 'PTZ_ERROR',
          message: 'PTZ 控制失败',
          details: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });

  // PTZ 缩放
  fastify.post('/zoom', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { direction, speed } = zoomSchema.parse(request.body);
      
      await onvifService.ptzZoom(direction, speed);
      
      return { success: true };
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
          code: 'PTZ_ERROR',
          message: '缩放控制失败',
          details: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });

  // 获取预置位
  fastify.get('/presets', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const presets = await onvifService.getPresets();
      
      return {
        success: true,
        data: presets,
      };
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: {
          code: 'PTZ_ERROR',
          message: '获取预置位失败',
          details: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });

  // 前往预置位
  fastify.post('/presets/:token/goto', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { token } = request.params as { token: string };
      
      await onvifService.gotoPreset(token);
      
      return { success: true };
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: {
          code: 'PTZ_ERROR',
          message: '前往预置位失败',
          details: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });
};

export const ptzRoutes = ptzPlugin;
