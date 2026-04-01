// ============================================================
// 认证服务
// ============================================================

import * as jose from 'jose';
import bcrypt from 'bcrypt';
import { prisma } from '@/db';
import { env } from '@/shared/config';
import { AuthError, ValidationError } from '@/shared/errors';

const SALT_ROUNDS = 12;
const ACCESS_TOKEN_TTL = 15 * 60; // 15 minutes
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days

async function generateKey(secret: string): Promise<jose.KeyLike> {
  return new TextEncoder().encode(secret) as jose.KeyLike;
}

// 生成 JWT Access Token
async function signAccessToken(
  userId: string,
  appId: string,
  instanceId: string
): Promise<{ token: string; expiresIn: number }> {
  const secret = await generateKey(env.JWT_SECRET);
  const jti = crypto.randomUUID();

  const token = await new jose.SignJWT({ appId, instanceId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL}s`)
    .sign(secret);

  return { token, expiresIn: ACCESS_TOKEN_TTL };
}

// 注册
export async function register(data: {
  email: string;
  password: string;
  name: string;
  appId?: string;
  deviceId?: string;
}) {
  if (!data.email || !data.password) {
    throw new ValidationError('Email and password are required');
  }
  if (data.password.length < 8) {
    throw new ValidationError('Password must be at least 8 characters');
  }

  // 检查用户是否已存在
  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { email: data.email },
        ...(data.appId === 'health' ? [{ appInstances: { some: { appId: data.appId ?? 'health', user: { email: data.email } } } }] : []),
      ],
    },
  });

  if (existing) {
    throw new ValidationError('User with this email already exists');
  }

  const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

  // 创建用户 + 默认 AppInstance
  const user = await prisma.user.create({
    data: {
      email: data.email,
      passwordHash,
      name: data.name,
      appInstances: {
        create: {
          appId: data.appId ?? 'health',
          nickname: data.name,
          settings: {},
        },
      },
    },
    include: {
      appInstances: {
        where: { appId: data.appId ?? 'health' },
        take: 1,
      },
    },
  });

  // 注册设备（如果提供了 deviceId）
  if (data.deviceId) {
    await prisma.device.upsert({
      where: { deviceId: data.deviceId },
      create: {
        userId: user.id,
        deviceId: data.deviceId,
        deviceName: 'Unknown Device',
        deviceType: 'web',
      },
      update: {
        userId: user.id,
        lastActiveAt: new Date(),
      },
    });
  }

  const instance = user.appInstances[0];
  if (!instance) throw new Error('Failed to create app instance');

  const { token, expiresIn } = await signAccessToken(user.id, instance.appId, instance.id);

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    },
    accessToken: token,
    expiresIn,
  };
}

// 登录
export async function login(data: {
  identifier: string;
  password: string;
  appId?: string;
  deviceId?: string;
}) {
  if (!data.identifier || !data.password) {
    throw new ValidationError('Email/phone and password are required');
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: data.identifier },
        { phone: data.identifier },
      ],
    },
    include: {
      appInstances: {
        where: { appId: data.appId ?? 'health' },
        take: 1,
      },
    },
  });

  if (!user || !user.passwordHash) {
    throw new AuthError('Invalid credentials', 'AUTH_INVALID_CREDENTIALS');
  }

  const valid = await bcrypt.compare(data.password, user.passwordHash);
  if (!valid) {
    throw new AuthError('Invalid credentials', 'AUTH_INVALID_CREDENTIALS');
  }

  // 设备注册
  if (data.deviceId) {
    await prisma.device.upsert({
      where: { deviceId: data.deviceId },
      create: {
        userId: user.id,
        deviceId: data.deviceId,
        deviceName: 'Unknown Device',
        deviceType: 'web',
      },
      update: {
        lastActiveAt: new Date(),
      },
    });
  }

  const instance = user.appInstances[0];
  if (!instance) {
    // 用户没有该 APP 的实例，创建一个
    const newInstance = await prisma.appInstance.create({
      data: {
        userId: user.id,
        appId: data.appId ?? 'health',
        nickname: user.name,
        settings: {},
      },
    });
    const { token, expiresIn } = await signAccessToken(user.id, newInstance.appId, newInstance.id);
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
      accessToken: token,
      expiresIn,
    };
  }

  const { token, expiresIn } = await signAccessToken(user.id, instance.appId, instance.id);

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    },
    accessToken: token,
    expiresIn,
  };
}

// 获取当前用户
export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });
  if (!user || user.deletedAt) {
    throw new AuthError('User not found');
  }
  return user;
}
