import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { EventModel } from '../models';

const eventPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // 获取事件列表
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { page = '1', limit = '20', type } = request.query as { 
        page?: string; 
        limit?: string;
        type?: string;
      };
      
      const pageNum = parseInt(page, 10);
      const limitNum = Math.min(parseInt(limit, 10), 100);
      
      const { items, total } = EventModel.findAll(limitNum, (pageNum - 1) * limitNum);
      
      // 根据类型过滤
      let filteredItems = items;
      if (type) {
        filteredItems = items.filter(item => item.eventType === type);
      }
      
      return {
        success: true,
        data: {
          items: filteredItems,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum),
            hasNext: pageNum * limitNum < total,
            hasPrev: pageNum > 1,
          },
        },
      };
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '获取事件列表失败',
        },
      });
    }
  });

  // WebSocket 实时事件 (简化版，使用轮询)
  fastify.get('/live', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    reply.header('Content-Type', 'text/event-stream');
    reply.header('Cache-Control', 'no-cache');
    reply.header('Connection', 'keep-alive');
    
    // 简化实现，返回一个测试消息
    return {
      success: true,
      message: 'WebSocket 事件流需要更复杂的实现',
    };
  });
};

export const eventRoutes = eventPlugin;
