// ============================================================
// 共享工具 - Prisma 客户端（Serverless 单例）
// ============================================================

import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient;

export function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

// ============================================================
// 统一响应格式
// ============================================================

export function ok<T>(data: T, status = 200) {
  return new Response(
    JSON.stringify({ success: true, data, timestamp: new Date().toISOString() }),
    { status, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
  );
}

export function err(code: string, message: string, status = 400, details?: unknown) {
  return new Response(
    JSON.stringify({ success: false, error: { code, message, details }, timestamp: new Date().toISOString() }),
    { status, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
  );
}

export function corsHeaders() {
  const origin = process.env.CORS_ORIGIN ?? '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };
}

export function handleOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

// ============================================================
// JWT 验证
// ============================================================

import * as jose from 'jose';

export interface JWTPayload {
  sub: string;
  appId: string;
  instanceId: string;
}

export async function verifyToken(request: Request): Promise<JWTPayload> {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    throw Object.assign(new Error('Missing token'), { status: 401, code: 'AUTH_MISSING_TOKEN' });
  }
  const token = auth.slice(7);
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? 'dev-secret-change-me');
    const { payload } = await jose.jwtVerify(token, secret);
    return payload as unknown as JWTPayload;
  } catch (e) {
    if (e instanceof jose.errors.JWTExpired) {
      throw Object.assign(new Error('Token expired'), { status: 401, code: 'AUTH_TOKEN_EXPIRED' });
    }
    throw Object.assign(new Error('Invalid token'), { status: 401, code: 'AUTH_INVALID_TOKEN' });
  }
}

export async function signToken(userId: string, appId: string, instanceId: string): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? 'dev-secret-change-me');
  return new jose.SignJWT({ appId, instanceId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(secret);
}
