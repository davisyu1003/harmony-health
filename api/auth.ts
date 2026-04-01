// ============================================================
// 认证 API
// POST /api/auth/register
// POST /api/auth/login
// ============================================================

import { getPrisma, ok, err, signToken, handleOptions } from './_lib';
import bcrypt from 'bcrypt';

export default async function handler(request: Request) {
  if (request.method === 'OPTIONS') return handleOptions();

  const prisma = getPrisma();

  if (request.method === 'POST') {
    const body = await request.json();
    const { email, password, name, action } = body;

    if (action === 'login') {
      if (!email || !password) return err('VALIDATION_ERROR', 'email and password required', 400);

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !user.passwordHash) return err('AUTH_INVALID_CREDENTIALS', 'Invalid credentials', 401);

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) return err('AUTH_INVALID_CREDENTIALS', 'Invalid credentials', 401);

      // 获取或创建 app instance
      let instance = await prisma.appInstance.findFirst({
        where: { userId: user.id, appId: 'health' },
      });
      if (!instance) {
        instance = await prisma.appInstance.create({
          data: { userId: user.id, appId: 'health', nickname: user.name, settings: {} },
        });
      }

      const token = await signToken(user.id, 'health', instance.id);
      return ok({ user: { id: user.id, email: user.email, name: user.name }, accessToken: token, expiresIn: 900 });
    }

    if (action === 'register') {
      if (!email || !password || !name) return err('VALIDATION_ERROR', 'email, password, name required', 400);
      if (password.length < 8) return err('VALIDATION_ERROR', 'Password must be at least 8 characters', 400);

      const exists = await prisma.user.findUnique({ where: { email } });
      if (exists) return err('VALIDATION_ERROR', 'User already exists', 409);

      const hash = await bcrypt.hash(password, 12);
      const user = await prisma.user.create({
        data: { email, passwordHash: hash, name, appInstances: { create: { appId: 'health', nickname: name, settings: {} } } },
        include: { appInstances: { where: { appId: 'health' }, take: 1 } },
      });

      const instance = user.appInstances[0];
      const token = await signToken(user.id, 'health', instance.id);
      return ok({ user: { id: user.id, email: user.email, name: user.name }, accessToken: token, expiresIn: 900 }, 201);
    }

    return err('INVALID_ACTION', 'action must be login or register', 400);
  }

  return err('METHOD_NOT_ALLOWED', `Method ${request.method} not supported`, 405);
}