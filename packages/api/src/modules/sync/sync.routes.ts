// ============================================================
// 同步路由 - 核心同步接口
// ============================================================

import type { FastifyInstance } from 'fastify';
import { authenticate, getAppInstanceId, getUserId } from '@/shared/middleware/auth';
import { prisma } from '@/db';
import { upsertRecord, upsertWeeklyMeta, upsertHabit, upsertHabitLog } from '@/modules/health/health.service';

export async function syncRoutes(app: FastifyInstance) {
  // ============================================================
  // POST /api/v1/sync — 核心同步接口
  // ============================================================

  app.post('/', { preHandler: authenticate }, async (request, reply) => {
    const payload = await authenticate(request, reply);
    const instanceId = getAppInstanceId(payload);
    const userId = getUserId(payload);
    const body = request.body as {
      deviceId: string;
      lastSyncAt: string;
      changes: Array<{
        entityType: string;
        entityId: string;
        operation: string;
        version: number;
        payload: unknown;
        timestamp: string;
      }>;
    };

    const serverTime = new Date().toISOString();
    const accepted: string[] = [];
    const rejected: Array<{ entityId: string; reason: string; currentVersion?: number }> = [];
    const conflicts: Array<{
      entityId: string;
      clientData: unknown;
      serverData: unknown;
      conflictType: string;
    }> = [];

    // 处理客户端变更
    for (const change of body.changes ?? []) {
      try {
        switch (change.entityType) {
          case 'health_record': {
            const p = change.payload as Record<string, unknown>;
            const record = await upsertRecord({
              instanceId,
              userId,
              updatedBy: userId,
              id: change.entityId,
              categoryId: p.categoryId as string,
              fieldId: p.fieldId as string,
              recordDate: p.recordDate as string,
              value: p.value as number,
              version: change.version,
            });
            accepted.push(change.entityId);
            break;
          }
          case 'weekly_meta': {
            const p = change.payload as Record<string, unknown>;
            const meta = await upsertWeeklyMeta({
              instanceId,
              userId,
              updatedBy: userId,
              weekKey: p.weekKey as string,
              weight: p.weight as number | undefined,
              height: p.height as number | undefined,
              note: p.note as string | undefined,
              version: change.version,
            });
            accepted.push(change.entityId);
            break;
          }
          case 'habit': {
            const p = change.payload as Record<string, unknown>;
            const habit = await upsertHabit({
              instanceId,
              userId,
              id: change.entityId,
              name: p.name as string,
              version: change.version,
            });
            accepted.push(habit.id);
            break;
          }
          case 'habit_log': {
            const p = change.payload as Record<string, unknown>;
            const log = await upsertHabitLog({
              habitId: p.habitId as string,
              userId,
              updatedBy: userId,
              logDate: p.logDate as string,
              weekKey: p.weekKey as string,
              status: p.status as 'completed' | 'missed',
              version: change.version,
            });
            accepted.push(log.id);
            break;
          }
          default:
            rejected.push({ entityId: change.entityId, reason: 'UNKNOWN_ENTITY_TYPE' });
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'ConflictError') {
          conflicts.push({
            entityId: change.entityId,
            clientData: change.payload,
            serverData: (error as { details?: unknown }).details,
            conflictType: 'VERSION_CONFLICT',
          });
        } else {
          rejected.push({ entityId: change.entityId, reason: 'PROCESSING_ERROR' });
        }
      }
    }

    // 获取服务端变更（自 lastSyncAt 以来的变化）
    const lastSyncAt = body.lastSyncAt ? new Date(body.lastSyncAt) : new Date(0);

    const [records, metas] = await Promise.all([
      prisma.healthRecord.findMany({
        where: {
          appInstanceId: instanceId,
          userId,
          updatedAt: { gt: lastSyncAt },
        },
      }),
      prisma.weeklyMeta.findMany({
        where: {
          appInstanceId: instanceId,
          userId,
          updatedAt: { gt: lastSyncAt },
        },
      }),
    ]);

    const serverChanges = [
      ...records.map((r) => ({
        entityType: 'health_record',
        entityId: r.id,
        operation: 'update',
        version: r.version,
        payload: r,
        timestamp: r.updatedAt.toISOString(),
      })),
      ...metas.map((m) => ({
        entityType: 'weekly_meta',
        entityId: m.id,
        operation: 'update',
        version: m.version,
        payload: m,
        timestamp: m.updatedAt.toISOString(),
      })),
    ];

    return reply.send({
      success: true,
      data: {
        serverTime,
        accepted,
        rejected,
        conflicts,
        serverChanges,
      },
      timestamp: serverTime,
    });
  });
}
