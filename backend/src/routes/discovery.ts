import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';
import { onvifDiscoveryService } from '../services/discovery';
import { CameraModel } from '../models';

const scanSchema = z.object({
  mode: z.enum(['network', 'range', 'single']),
  startIp: z.string().ip().optional(),
  endIp: z.string().ip().optional(),
  ip: z.string().ip().optional(),
  port: z.number().int().min(1).max(65535).default(80),
  username: z.string().optional(),
  password: z.string().optional(),
});

const configureSchema = z.object({
  ip: z.string().ip(),
  port: z.number().int().min(1).max(65535).default(80),
  onvifUrl: z.string().url(),
  username: z.string().optional(),
  password: z.string().optional(),
  name: z.string().default('摄像头'),
});

const discoveryPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // 扫描摄像头
  fastify.post('/scan', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const data = scanSchema.parse(request.body);
      let devices: any[] = [];

      switch (data.mode) {
        case 'network':
          // 使用WS-Discovery扫描局域网
          devices = await onvifDiscoveryService.scanNetwork();
          break;

        case 'range':
          // 扫描IP范围
          if (!data.startIp || !data.endIp) {
            return reply.status(400).send({
              success: false,
              error: {
                code: 'INVALID_PARAMS',
                message: 'IP范围模式需要提供startIp和endIp',
              },
            });
          }
          devices = await onvifDiscoveryService.scanIpRange(data.startIp, data.endIp, data.port);
          break;

        case 'single':
          // 测试单个IP
          if (!data.ip) {
            return reply.status(400).send({
              success: false,
              error: {
                code: 'INVALID_PARAMS',
                message: '单IP模式需要提供ip参数',
              },
            });
          }
          const device = await onvifDiscoveryService.testOnvifDevice(
            data.ip,
            data.port,
            data.username,
            data.password
          );
          if (device) {
            devices = [device];
          }
          break;
      }

      // 获取设备的详细信息
      const devicesWithInfo = await Promise.all(
        devices.map(async (device) => {
          try {
            const info = await onvifDiscoveryService.getDeviceInfo(
              device.ip,
              device.port,
              device.onvifUrl,
              data.username,
              data.password
            );
            return { ...device, ...info };
          } catch {
            return device;
          }
        })
      );

      return {
        success: true,
        data: {
          count: devicesWithInfo.length,
          devices: devicesWithInfo,
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

      return reply.status(500).send({
        success: false,
        error: {
          code: 'SCAN_ERROR',
          message: '扫描失败',
          details: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });

  // 获取设备的RTSP流地址
  fastify.post('/stream-uri', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { ip, port, onvifUrl, username, password } = z.object({
        ip: z.string().ip(),
        port: z.number().default(80),
        onvifUrl: z.string().url(),
        username: z.string().optional(),
        password: z.string().optional(),
      }).parse(request.body);

      const streamUri = await onvifDiscoveryService.getStreamUri(
        ip,
        port,
        onvifUrl,
        username,
        password
      );

      if (!streamUri) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'STREAM_NOT_FOUND',
            message: '无法获取视频流地址，请检查用户名密码',
          },
        });
      }

      return {
        success: true,
        data: {
          rtspUrl: streamUri,
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

      return reply.status(500).send({
        success: false,
        error: {
          code: 'STREAM_ERROR',
          message: '获取流地址失败',
          details: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });

  // 自动配置摄像头
  fastify.post('/configure', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const data = configureSchema.parse(request.body);

      // 获取设备信息
      const deviceInfo = await onvifDiscoveryService.getDeviceInfo(
        data.ip,
        data.port,
        data.onvifUrl,
        data.username,
        data.password
      );

      // 获取RTSP流地址
      const streamUri = await onvifDiscoveryService.getStreamUri(
        data.ip,
        data.port,
        data.onvifUrl,
        data.username,
        data.password
      );

      if (!streamUri) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'STREAM_NOT_FOUND',
            message: '无法获取视频流地址，配置失败',
          },
        });
      }

      // 保存到数据库
      const config = CameraModel.upsert({
        name: data.name || `${deviceInfo.manufacturer || 'ONVIF'} ${deviceInfo.model || 'Camera'}`,
        ip: data.ip,
        port: data.port,
        username: data.username,
        password: data.password,
        rtspUrl: streamUri,
        onvifUrl: data.onvifUrl,
        capabilities: {
          ptz: true,
          zoom: true,
          events: ['motion', 'tampering'],
        },
        status: 'connected',
      });

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

      return reply.status(500).send({
        success: false,
        error: {
          code: 'CONFIGURE_ERROR',
          message: '配置失败',
          details: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });

  // 测试并自动发现（一键配置）
  fastify.post('/auto-discover', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { ip, port = 80, username, password } = z.object({
        ip: z.string().ip(),
        port: z.number().default(80),
        username: z.string().optional(),
        password: z.string().optional(),
      }).parse(request.body);

      // 1. 测试ONVIF连接
      const device = await onvifDiscoveryService.testOnvifDevice(ip, port, username, password);
      
      if (!device) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'DEVICE_NOT_FOUND',
            message: '未找到ONVIF设备，请检查IP和端口',
          },
        });
      }

      // 2. 获取设备信息
      const deviceInfo = await onvifDiscoveryService.getDeviceInfo(
        device.ip,
        device.port,
        device.onvifUrl,
        username,
        password
      );

      // 3. 获取RTSP流地址
      const streamUri = await onvifDiscoveryService.getStreamUri(
        device.ip,
        device.port,
        device.onvifUrl,
        username,
        password
      );

      if (!streamUri) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'STREAM_NOT_FOUND',
            message: '无法获取视频流地址，请检查用户名密码是否正确',
          },
        });
      }

      // 4. 保存配置
      const config = CameraModel.upsert({
        name: `${deviceInfo.manufacturer || 'ONVIF'} ${deviceInfo.model || 'Camera'}`,
        ip: device.ip,
        port: device.port,
        username,
        password,
        rtspUrl: streamUri,
        onvifUrl: device.onvifUrl,
        capabilities: {
          ptz: true,
          zoom: true,
          events: ['motion', 'tampering'],
        },
        status: 'connected',
      });

      return {
        success: true,
        data: {
          message: '摄像头配置成功',
          device: {
            ...config,
            password: undefined,
          },
          info: deviceInfo,
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

      return reply.status(500).send({
        success: false,
        error: {
          code: 'AUTO_DISCOVER_ERROR',
          message: '自动发现失败',
          details: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });
};

export const discoveryRoutes = fp(discoveryPlugin);
