import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { RecordingModel } from '../models';
import fs from 'fs';
import { recordingService } from '../services/recording';

const recordingPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // 获取录像列表
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { page = '1', limit = '20' } = request.query as { page?: string; limit?: string };
      
      const pageNum = parseInt(page, 10);
      const limitNum = Math.min(parseInt(limit, 10), 100);
      const offset = (pageNum - 1) * limitNum;
      
      const { items, total } = RecordingModel.findAll(limitNum, offset);
      
      return {
        success: true,
        data: {
          items: items.map(rec => ({
            ...rec,
            // Use static file serving for better performance and range support
            videoUrl: `/public/storage/${rec.filePath}`,
            thumbnailUrl: rec.thumbnailPath ? `/public/storage/${rec.thumbnailPath}` : null,
          })),
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
          message: '获取录像列表失败',
        },
      });
    }
  });

  // 获取录像详情
  fastify.get('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const recording = RecordingModel.findById(parseInt(id, 10));
    
    if (!recording) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: '录像不存在',
        },
      });
    }
    
    return {
      success: true,
      data: {
        ...recording,
        videoUrl: `/public/storage/${recording.filePath}`,
        thumbnailUrl: recording.thumbnailPath ? `/public/storage/${recording.thumbnailPath}` : null,
      },
    };
  });

  // 播放录像
  fastify.get('/:id/stream', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const recording = RecordingModel.findById(parseInt(id, 10));
    
    if (!recording) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: '录像不存在',
        },
      });
    }
    
    const filePath = recordingService.resolveStoragePath(recording.filePath);
    
    if (!fs.existsSync(filePath)) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'FILE_NOT_FOUND',
          message: '录像文件不存在',
        },
      });
    }
    
    return reply.send(fs.createReadStream(filePath));
  });

  // 删除录像
  fastify.delete('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    
    RecordingModel.softDelete(parseInt(id, 10));
    
    return { success: true };
  });

  // 批量删除
  fastify.post('/batch-delete', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { ids } = z.object({
        ids: z.array(z.number()),
      }).parse(request.body);
      
      for (const id of ids) {
        RecordingModel.softDelete(id);
      }
      
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
      throw error;
    }
  });
};

export const recordingRoutes = recordingPlugin;
