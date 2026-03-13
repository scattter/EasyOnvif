import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { SettingModel, RecordingModel } from '../models';
import { recordingService } from '../services/recording';

const configSchema = z.object({
  quotaGB: z.number().min(1).max(1000).optional(),
  prebufferSeconds: z.number().min(5).max(60).optional(),
  postbufferSeconds: z.number().min(10).max(300).optional(),
  autoCleanup: z.boolean().optional(),
  cleanupThreshold: z.number().min(50).max(100).optional(),
});

const storagePlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // 获取存储状态
  fastify.get('/status', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const quotaGB = parseInt(SettingModel.get('storage.quota_gb') || '50', 10);
    const usedBytes = RecordingModel.getStorageUsage();
    const usedGB = usedBytes / (1024 * 1024 * 1024);
    const freeGB = Math.max(0, quotaGB - usedGB);
    
    const recordingCount = parseInt(
      SettingModel.get('recording_count') || '0', 
      10
    );
    
    return {
      success: true,
      data: {
        quotaGB,
        usedGB: parseFloat(usedGB.toFixed(2)),
        freeGB: parseFloat(freeGB.toFixed(2)),
        usagePercent: parseFloat(((usedGB / quotaGB) * 100).toFixed(1)),
        recordingCount,
        oldestRecording: null, // 可以从数据库查询
      },
    };
  });

  // 获取存储配置
  fastify.get('/config', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const settings = SettingModel.getAll();
    const config: Record<string, any> = {};
    
    for (const setting of settings) {
      if (setting.key.startsWith('storage.')) {
        const key = setting.key.replace('storage.', '');
        config[key] = setting.value;
      }
    }
    
    return {
      success: true,
      data: {
        quotaGB: parseInt(config.quota_gb || '50', 10),
        prebufferSeconds: parseInt(config.prebuffer_seconds || '10', 10),
        postbufferSeconds: parseInt(config.postbuffer_seconds || '60', 10),
        autoCleanup: config.auto_cleanup === 'true',
        cleanupThreshold: parseInt(config.cleanup_threshold || '90', 10),
      },
    };
  });

  // 更新存储配置
  fastify.put('/config', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const data = configSchema.parse(request.body);
      
      if (data.quotaGB !== undefined) {
        SettingModel.set('storage.quota_gb', data.quotaGB.toString());
      }
      if (data.prebufferSeconds !== undefined) {
        SettingModel.set('storage.prebuffer_seconds', data.prebufferSeconds.toString());
      }
      if (data.postbufferSeconds !== undefined) {
        SettingModel.set('storage.postbuffer_seconds', data.postbufferSeconds.toString());
      }
      if (data.autoCleanup !== undefined) {
        SettingModel.set('storage.auto_cleanup', data.autoCleanup.toString());
      }
      if (data.cleanupThreshold !== undefined) {
        SettingModel.set('storage.cleanup_threshold', data.cleanupThreshold.toString());
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

  // 手动清理存储
  fastify.post('/cleanup', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const result = await recordingService.cleanupStorage();
      
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: {
          code: 'CLEANUP_FAILED',
          message: '清理存储失败',
          details: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });
};

export const storageRoutes = storagePlugin;
