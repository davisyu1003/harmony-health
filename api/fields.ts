// ============================================================
// 健康字段 API
// POST /api/health/fields
// ============================================================

import { getPrisma, ok, err, verifyToken, handleOptions } from './_lib';

export default async function handler(request: Request) {
  if (request.method === 'OPTIONS') return handleOptions();

  try {
    const payload = await verifyToken(request);
    const prisma = getPrisma();

    if (request.method === 'POST') {
      const body = await request.json();
      const { categoryId, name } = body;
      if (!categoryId || !name) return err('VALIDATION_ERROR', 'categoryId and name required', 400);

      const count = await prisma.healthField.count({ where: { categoryId } });
      const field = await prisma.healthField.create({
        data: { categoryId, name, sortOrder: count },
      });
      return ok(field, 201);
    }

    return err('METHOD_NOT_ALLOWED', `Method ${request.method} not supported`, 405);
  } catch (e: any) {
    return err(e.code ?? 'SERVER_ERROR', e.message, e.status ?? 500);
  }
}