import { FastifyInstance, FastifyPluginAsync } from 'fastify';

const systemPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // 获取系统状态
  fastify.get('/status', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    return {
      success: true,
      data: {
        version: '1.0.0',
        uptime: process.uptime(),
        cameraConnected: true, // 从 onvifService 获取
        streamActive: true,
        recordingActive: true,
      },
    };
  });

  // 获取系统日志
  fastify.get('/logs', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { limit = '100', level } = request.query as { limit?: string; level?: string };
    
    // 简化实现，返回空数组
    return {
      success: true,
      data: [],
    };
  });
};

export const systemRoutes = systemPlugin;
