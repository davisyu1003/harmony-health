// ============================================================
// 健康记录路由
// ============================================================

import type { FastifyInstance } from 'fastify';
import {
  listCategories,
  createCategory,
  createField,
  listRecords,
  upsertRecord,
  getWeeklyMeta,
  upsertWeeklyMeta,
  listHabits,
  upsertHabit,
  upsertHabitLog,
} from './health.service';
import { authenticate, getAppInstanceId, getUserId } from '@/shared/middleware/auth';
import { ValidationError } from '@/shared/errors';

export async function healthRoutes(app: FastifyInstance) {
  // ============================================================
  // 分类 & 字段
  // ============================================================

  app.get('/categories', { preHandler: authenticate }, async (request, reply) => {
    const payload = await authenticate(request, reply);
    const instanceId = getAppInstanceId(payload);
    const categories = await listCategories(instanceId);
    return reply.send({ success: true, data: categories, timestamp: new Date().toISOString() });
  });

  app.post('/categories', { preHandler: authenticate }, async (request, reply) => {
    const payload = await authenticate(request, reply);
    const instanceId = getAppInstanceId(payload);
    const body = request.body as Record<string, unknown>;
    const category = await createCategory({
      instanceId,
      name: body.name as string,
      color: (body.color as string) ?? '#C8694A',
    });
    return reply.status(201).send({ success: true, data: category, timestamp: new Date().toISOString() });
  });

  app.post('/fields', { preHandler: authenticate }, async (request, reply) => {
    const payload = await authenticate(request, reply);
    const body = request.body as Record<string, unknown>;
    if (!body.categoryId || !body.name) throw new ValidationError('categoryId and name are required');
    const field = await createField({
      categoryId: body.categoryId as string,
      name: body.name as string,
    });
    return reply.status(201).send({ success: true, data: field, timestamp: new Date().toISOString() });
  });

  // ============================================================
  // 健康记录
  // ============================================================

  app.get('/records', { preHandler: authenticate }, async (request, reply) => {
    const payload = await authenticate(request, reply);
    const instanceId = getAppInstanceId(payload);
    const userId = getUserId(payload);
    const query = request.query as Record<string, unknown>;
    const records = await listRecords({
      instanceId,
      userId,
      categoryId: query.categoryId as string | undefined,
      fieldId: query.fieldId as string | undefined,
      from: query.from as string | undefined,
      to: query.to as string | undefined,
    });
    return reply.send({ success: true, data: records, timestamp: new Date().toISOString() });
  });

  app.post('/records', { preHandler: authenticate }, async (request, reply) => {
    const payload = await authenticate(request, reply);
    const instanceId = getAppInstanceId(payload);
    const userId = getUserId(payload);
    const body = request.body as Record<string, unknown>;
    if (!body.categoryId || !body.fieldId || body.value === undefined) {
      throw new ValidationError('categoryId, fieldId, value are required');
    }
    const record = await upsertRecord({
      instanceId,
      userId,
      updatedBy: userId,
      id: body.id as string | undefined,
      categoryId: body.categoryId as string,
      fieldId: body.fieldId as string,
      recordDate: (body.recordDate as string) ?? new Date().toISOString().split('T')[0] ?? '',
      value: body.value as number,
      version: (body.version as number) ?? 1,
    });
    return reply.status(201).send({ success: true, data: record, timestamp: new Date().toISOString() });
  });

  // ============================================================
  // 周元数据 (BMI + 备注)
  // ============================================================

  app.get('/weekly/:weekKey', { preHandler: authenticate }, async (request, reply) => {
    const payload = await authenticate(request, reply);
    const instanceId = getAppInstanceId(payload);
    const { weekKey } = request.params as { weekKey: string };
    const meta = await getWeeklyMeta(instanceId, weekKey);
    return reply.send({ success: true, data: meta, timestamp: new Date().toISOString() });
  });

  app.post('/weekly', { preHandler: authenticate }, async (request, reply) => {
    const payload = await authenticate(request, reply);
    const instanceId = getAppInstanceId(payload);
    const userId = getUserId(payload);
    const body = request.body as Record<string, unknown>;
    if (!body.weekKey) throw new ValidationError('weekKey is required');
    const meta = await upsertWeeklyMeta({
      instanceId,
      userId,
      updatedBy: userId,
      weekKey: body.weekKey as string,
      weight: body.weight as number | undefined,
      height: body.height as number | undefined,
      note: body.note as string | undefined,
      version: (body.version as number) ?? 1,
    });
    return reply.status(201).send({ success: true, data: meta, timestamp: new Date().toISOString() });
  });

  // ============================================================
  // 习惯
  // ============================================================

  app.get('/habits', { preHandler: authenticate }, async (request, reply) => {
    const payload = await authenticate(request, reply);
    const instanceId = getAppInstanceId(payload);
    const habits = await listHabits(instanceId);
    return reply.send({ success: true, data: habits, timestamp: new Date().toString() });
  });

  app.post('/habits', { preHandler: authenticate }, async (request, reply) => {
    const payload = await authenticate(request, reply);
    const instanceId = getAppInstanceId(payload);
    const userId = getUserId(payload);
    const body = request.body as Record<string, unknown>;
    if (!body.name) throw new ValidationError('name is required');
    const habit = await upsertHabit({
      instanceId,
      userId,
      id: body.id as string | undefined,
      name: body.name as string,
    });
    return reply.status(201).send({ success: true, data: habit, timestamp: new Date().toISOString() });
  });

  app.post('/habits/logs', { preHandler: authenticate }, async (request, reply) => {
    const payload = await authenticate(request, reply);
    const userId = getUserId(payload);
    const body = request.body as Record<string, unknown>;
    if (!body.habitId || !body.status) throw new ValidationError('habitId and status are required');
    const log = await upsertHabitLog({
      habitId: body.habitId as string,
      userId,
      updatedBy: userId,
      logDate: (body.logDate as string) ?? new Date().toISOString().split('T')[0] ?? '',
      weekKey: (body.weekKey as string) ?? '',
      status: body.status as 'completed' | 'missed',
    });
    return reply.status(201).send({ success: true, data: log, timestamp: new Date().toISOString() });
  });
}
