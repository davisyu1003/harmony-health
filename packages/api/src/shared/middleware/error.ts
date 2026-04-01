// ============================================================
// 全局错误处理中间件
// ============================================================

import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../errors';

export function errorHandler(
  error: FastifyError | AppError | Error,
  request: FastifyRequest,
  reply: FastifyReply
) {
  // AppError — 已知业务错误
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
      timestamp: new Date().toISOString(),
    });
  }

  // Fastify 验证错误
  if ('validation' in error && Array.isArray(error.validation)) {
    return reply.status(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: error.validation,
      },
      timestamp: new Date().toISOString(),
    });
  }

  // 未知错误
  console.error('[Error]', error);
  return reply.status(500).send({
    success: false,
    error: {
      code: 'SRV_INTERNAL_ERROR',
      message: 'Internal server error',
    },
    timestamp: new Date().toISOString(),
  });
}
