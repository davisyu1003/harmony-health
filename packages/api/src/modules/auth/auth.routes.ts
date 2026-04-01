// ============================================================
// 认证路由
// ============================================================

import type { FastifyInstance } from 'fastify';
import { register, login, getMe } from './auth.service';
import { authenticate } from '@/shared/middleware/auth';

export async function authRoutes(app: FastifyInstance) {
  // POST /api/v1/auth/register
  app.post('/register', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const result = await register({
      email: body.email as string,
      password: body.password as string,
      name: body.name as string,
      appId: body.appId as string | undefined,
      deviceId: body.deviceId as string | undefined,
    });
    return reply.status(201).send({ success: true, data: result, timestamp: new Date().toISOString() });
  });

  // POST /api/v1/auth/login
  app.post('/login', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const result = await login({
      identifier: body.identifier as string,
      password: body.password as string,
      appId: body.appId as string | undefined,
      deviceId: body.deviceId as string | undefined,
    });
    return reply.send({ success: true, data: result, timestamp: new Date().toISOString() });
  });

  // GET /api/v1/auth/me
  app.get('/me', { preHandler: authenticate }, async (request, reply) => {
    const payload = await authenticate(request, reply);
    const user = await getMe(payload.sub);
    return reply.send({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
      timestamp: new Date().toISOString(),
    });
  });
}
