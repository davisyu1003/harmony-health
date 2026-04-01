// ============================================================
// 健康记录 API - Serverless
// GET /api/health/records
// POST /api/health/records
// ============================================================

import { getPrisma, ok, err, verifyToken, handleOptions, corsHeaders } from './_lib';

export const config = { runtime: 'nodejs' };

export default async function handler(request: Request) {
  if (request.method === 'OPTIONS') return handleOptions();

  try {
    const payload = await verifyToken(request);
    const prisma = getPrisma();

    if (request.method === 'GET') {
      const url = new URL(request.url);
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      const categoryId = url.searchParams.get('categoryId');

      const records = await prisma.healthRecord.findMany({
        where: {
          appInstanceId: payload.instanceId,
          userId: payload.sub,
          deletedAt: null,
          ...(categoryId ? { categoryId } : {}),
          ...(from ? { recordDate: { gte: new Date(from) } } : {}),
          ...(to ? { recordDate: { lte: new Date(to) } } : {}),
        },
        orderBy: { recordDate: 'desc' },
        take: 50,
        include: { category: true, field: true },
      });

      return ok(records);
    }

    if (request.method === 'POST') {
      const body = await request.json();
      const { categoryId, fieldId, recordDate, value } = body;

      if (!categoryId || !fieldId || value === undefined) {
        return err('VALIDATION_ERROR', 'categoryId, fieldId, value required', 400);
      }

      const date = new Date(recordDate ?? new Date().toISOString().split('T')[0]);
      const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const recordWeek = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
      const recordYear = d.getUTCFullYear();

      const record = await prisma.healthRecord.upsert({
        where: {
          id: body.id ?? 'new-record-' + Math.random(),
        },
        create: {
          appInstanceId: payload.instanceId,
          userId: payload.sub,
          categoryId,
          fieldId,
          recordDate: date,
          recordWeek,
          recordYear,
          value,
          version: 1,
          updatedBy: payload.sub,
        },
        update: {
          value,
          recordDate: date,
          recordWeek,
          recordYear,
          version: { increment: 1 },
          updatedBy: payload.sub,
        },
      });

      return ok(record, 201);
    }

    return err('METHOD_NOT_ALLOWED', `Method ${request.method} not supported`, 405);
  } catch (e: any) {
    const status = e.status ?? 500;
    const code = e.code ?? 'SERVER_ERROR';
    return err(code, e.message, status, status === 500 ? undefined : e);
  }
}