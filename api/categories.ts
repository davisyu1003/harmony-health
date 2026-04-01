// ============================================================
// 健康分类 API
// GET /api/health/categories
// ============================================================

import { getPrisma, ok, err, verifyToken, handleOptions } from './_lib';

export default async function handler(request: Request) {
  if (request.method === 'OPTIONS') return handleOptions();

  try {
    const payload = await verifyToken(request);
    const prisma = getPrisma();

    if (request.method === 'GET') {
      const categories = await prisma.healthCategory.findMany({
        where: { appInstanceId: payload.instanceId, deletedAt: null },
        orderBy: { sortOrder: 'asc' },
        include: { fields: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } } },
      });
      return ok(categories);
    }

    if (request.method === 'POST') {
      const body = await request.json();
      const { name, color } = body;
      if (!name) return err('VALIDATION_ERROR', 'name required', 400);

      const cat = await prisma.healthCategory.create({
        data: { appInstanceId: payload.instanceId, name, color: color ?? '#C8694A', sortOrder: 0 },
      });
      return ok(cat, 201);
    }

    return err('METHOD_NOT_ALLOWED', `Method ${request.method} not supported`, 405);
  } catch (e: any) {
    return err(e.code ?? 'SERVER_ERROR', e.message, e.status ?? 500);
  }
}