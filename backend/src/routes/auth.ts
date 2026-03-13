
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { UserModel } from '../models';

// 验证 schema
const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

console.log('front auth')

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
});

export const authRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // 登录
  fastify.post('/login', async (request, reply) => {
    try {
      const { username, password } = loginSchema.parse(request.body);
      
      const user = UserModel.findByUsername(username);
      if (!user) {
        return reply.status(401).send({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: '用户名或密码错误',
          },
        });
      }

      const validPassword = await bcrypt.compare(password, user.passwordHash);
      if (!validPassword) {
        return reply.status(401).send({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: '用户名或密码错误',
          },
        });
      }

      const accessToken = fastify.jwt.sign({ userId: user.id, username: user.username });
      const refreshToken = fastify.jwt.sign({ userId: user.id, type: 'refresh' }, { expiresIn: '7d' });

      return {
        success: true,
        data: {
          accessToken,
          refreshToken,
          expiresIn: 900,
          user: {
            id: user.id,
            username: user.username,
            isDefaultPassword: user.isDefaultPassword,
          },
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

  // 刷新令牌
  fastify.post('/refresh', async (request, reply) => {
    try {
      const { refreshToken } = request.body as { refreshToken: string };
      
      if (!refreshToken) {
        return reply.status(401).send({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: '缺少刷新令牌',
          },
        });
      }

      const decoded = fastify.jwt.verify(refreshToken) as { userId: number; type: string };
      
      if (decoded.type !== 'refresh') {
        return reply.status(401).send({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: '无效的刷新令牌',
          },
        });
      }

      const user = UserModel.findById(decoded.userId);
      if (!user) {
        return reply.status(401).send({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: '用户不存在',
          },
        });
      }

      const newAccessToken = fastify.jwt.sign({ userId: user.id, username: user.username });

      return {
        success: true,
        data: {
          accessToken: newAccessToken,
          expiresIn: 900,
        },
      };
    } catch (err) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: '令牌已过期或无效',
        },
      });
    }
  });

  // 登出
  fastify.post('/logout', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    // JWT 是无状态的，这里可以加入令牌黑名单逻辑
    return { success: true };
  });

  // 修改密码
  fastify.put('/password', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const { currentPassword, newPassword } = changePasswordSchema.parse(request.body);
      const { userId } = request.user as { userId: number };

      const user = UserModel.findById(userId);
      if (!user) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: '用户不存在',
          },
        });
      }

      const validPassword = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!validPassword) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'INVALID_PASSWORD',
            message: '当前密码错误',
          },
        });
      }

      const newPasswordHash = await bcrypt.hash(newPassword, 12);
      UserModel.updatePassword(userId, newPasswordHash);

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

  // 获取当前用户信息
  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { userId } = request.user as { userId: number };
    const user = UserModel.findById(userId);
    
    if (!user) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: '用户不存在',
        },
      });
    }

    return {
      success: true,
      data: {
        id: user.id,
        username: user.username,
        isDefaultPassword: user.isDefaultPassword,
      },
    };
  });
};


