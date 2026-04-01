// ============================================================
// JWT 认证中间件
// ============================================================

import type { FastifyRequest, FastifyReply } from 'fastify';
import * as jose from 'jose';
import { env } from '../config';
import { AuthError } from '../errors';

const JWT_ALG = 'RS256';

interface JWTPayload {
  sub: string;       // userId
  appId: string;     // appId
  instanceId: string; // appInstanceId
  jti: string;       // token id (for revocation)
  iat: number;
  exp: number;
}

// 从 Authorization 头解析 JWT
export async function authenticate(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<JWTPayload> {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    throw new AuthError('Missing or invalid authorization header');
  }

  const token = authHeader.slice(7);

  try {
    // 在生产环境使用公钥，生产环境用 HS256 做简化演示
    const secret = new TextEncoder().encode(env.JWT_SECRET);
    const { payload } = await jose.jwtVerify(token, secret);

    if (!payload.sub || !payload.appId) {
      throw new AuthError('Invalid token payload');
    }

    return payload as unknown as JWTPayload;
  } catch (err) {
    if (err instanceof jose.errors.JWTExpired) {
      throw new AuthError('Token has expired', 'AUTH_TOKEN_EXPIRED');
    }
    throw new AuthError('Invalid token', 'AUTH_INVALID_TOKEN');
  }
}

// 快速获取当前用户 ID（在路由处理器中）
export function getUserId(payload: JWTPayload): string {
  return payload.sub;
}

export function getAppInstanceId(payload: JWTPayload): string {
  return payload.instanceId;
}
