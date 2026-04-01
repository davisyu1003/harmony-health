// ============================================================
// API 主入口
// ============================================================

import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { authRoutes } from '@/modules/auth/auth.routes';
import { healthRoutes } from '@/modules/health/health.routes';
import { syncRoutes } from '@/modules/sync/sync.routes';
import { errorHandler } from '@/shared/middleware/error';
import { env } from '@/shared/config';

const app = Fastify({
  logger: {
    level: env.NODE_ENV === 'development' ? 'info' : 'warn',
    transport:
      env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  },
});

// ============================================================
// 中间件
// ============================================================

// CORS
await app.register(cors, {
  origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()),
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

// Rate Limit
await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  keyGenerator: (req) => req.ip ?? 'unknown',
});

// 全局错误处理
app.setErrorHandler(errorHandler);

// ============================================================
// 健康检查
// ============================================================

app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

// ============================================================
// 路由注册
// ============================================================

app.register(authRoutes, { prefix: '/api/v1/auth' });
app.register(healthRoutes, { prefix: '/api/v1/health' });
app.register(syncRoutes, { prefix: '/api/v1/sync' });

// ============================================================
// 启动
// ============================================================

const start = async () => {
  try {
    const port = parseInt(env.PORT ?? '3001');
    await app.listen({ port, host: '0.0.0.0' });
    app.log.info(`🚀 Harmony Health API running on http://localhost:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
