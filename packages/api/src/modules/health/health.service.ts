// ============================================================
// 健康记录服务
// ============================================================

import { prisma } from '@/db';
import { ValidationError, NotFoundError, ConflictError } from '@/shared/errors';
import { Decimal } from '@prisma/client/runtime/library';

// ============================================================
// 分类 & 字段
// ============================================================

export async function listCategories(instanceId: string) {
  return prisma.healthCategory.findMany({
    where: { appInstanceId: instanceId, deletedAt: null },
    orderBy: { sortOrder: 'asc' },
    include: {
      fields: {
        where: { deletedAt: null },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });
}

export async function createCategory(data: {
  instanceId: string;
  name: string;
  color: string;
  sortOrder?: number;
}) {
  return prisma.healthCategory.create({
    data: {
      appInstanceId: data.instanceId,
      name: data.name,
      color: data.color,
      sortOrder: data.sortOrder ?? 0,
    },
  });
}

export async function createField(data: {
  categoryId: string;
  name: string;
  sortOrder?: number;
}) {
  const cat = await prisma.healthCategory.findUnique({ where: { id: data.categoryId } });
  if (!cat || cat.deletedAt) throw new NotFoundError('Category');

  return prisma.healthField.create({
    data: {
      categoryId: data.categoryId,
      name: data.name,
      sortOrder: data.sortOrder ?? 0,
    },
  });
}

// ============================================================
// 健康记录
// ============================================================

export async function listRecords(params: {
  instanceId: string;
  userId: string;
  categoryId?: string;
  fieldId?: string;
  from?: string;
  to?: string;
  limit?: number;
}) {
  const { instanceId, userId, categoryId, fieldId, from, to, limit = 50 } = params;

  const records = await prisma.healthRecord.findMany({
    where: {
      appInstanceId: instanceId,
      userId,
      deletedAt: null,
      ...(categoryId ? { categoryId } : {}),
      ...(fieldId ? { fieldId } : {}),
      ...(from ? { recordDate: { gte: new Date(from) } } : {}),
      ...(to ? { recordDate: { lte: new Date(to) } } : {}),
    },
    orderBy: { recordDate: 'desc' },
    take: limit,
    include: {
      category: true,
      field: true,
    },
  });

  return records;
}

export async function upsertRecord(data: {
  instanceId: string;
  userId: string;
  updatedBy: string;
  id?: string;
  categoryId: string;
  fieldId: string;
  recordDate: string;
  value: number;
  version: number;
}) {
  const existing = data.id
    ? await prisma.healthRecord.findUnique({ where: { id: data.id } })
    : await prisma.healthRecord.findFirst({
        where: {
          appInstanceId: data.instanceId,
          userId: data.userId,
          fieldId: data.fieldId,
          recordDate: new Date(data.recordDate),
          deletedAt: null,
        },
      });

  if (existing) {
    // 版本冲突检查
    if (data.version <= existing.version) {
      throw new ConflictError('Record has been modified', {
        currentVersion: existing.version,
        serverData: existing,
      });
    }
    return prisma.healthRecord.update({
      where: { id: existing.id },
      data: {
        value: data.value,
        recordDate: new Date(data.recordDate),
        version: existing.version + 1,
        updatedBy: data.updatedBy,
      },
    });
  }

  // 创建新记录
  const weekInfo = getWeekInfo(new Date(data.recordDate));
  return prisma.healthRecord.create({
    data: {
      appInstanceId: data.instanceId,
      userId: data.userId,
      categoryId: data.categoryId,
      fieldId: data.fieldId,
      recordDate: new Date(data.recordDate),
      recordWeek: weekInfo.week,
      recordYear: weekInfo.year,
      value: data.value,
      version: 1,
      updatedBy: data.updatedBy,
    },
  });
}

// ============================================================
// WeeklyMeta
// ============================================================

export async function getWeeklyMeta(instanceId: string, weekKey: string) {
  return prisma.weeklyMeta.findUnique({
    where: { appInstanceId_weekKey: { appInstanceId: instanceId, weekKey } },
  });
}

export async function upsertWeeklyMeta(data: {
  instanceId: string;
  userId: string;
  updatedBy: string;
  weekKey: string;
  weight?: number | null;
  height?: number | null;
  note?: string;
  version: number;
}) {
  const existing = await prisma.weeklyMeta.findUnique({
    where: { appInstanceId_weekKey: { appInstanceId: data.instanceId, weekKey: data.weekKey } },
  });

  if (existing) {
    if (data.version <= existing.version) {
      throw new ConflictError('WeeklyMeta has been modified', {
        currentVersion: existing.version,
      });
    }
    return prisma.weeklyMeta.update({
      where: { id: existing.id },
      data: {
        weight: data.weight !== undefined ? (data.weight ? new Decimal(data.weight) : null) : existing.weight,
        height: data.height !== undefined ? (data.height ? new Decimal(data.height) : null) : existing.height,
        note: data.note ?? existing.note,
        version: existing.version + 1,
        updatedBy: data.updatedBy,
      },
    });
  }

  const parts = data.weekKey.split('-W');
  return prisma.weeklyMeta.create({
    data: {
      appInstanceId: data.instanceId,
      userId: data.userId,
      weekKey: data.weekKey,
      year: parseInt(parts[0] ?? new Date().getFullYear().toString()),
      weekNumber: parseInt(parts[1] ?? '1'),
      weight: data.weight ? new Decimal(data.weight) : null,
      height: data.height ? new Decimal(data.height) : null,
      note: data.note ?? '',
      version: 1,
      updatedBy: data.updatedBy,
    },
  });
}

// ============================================================
// 习惯 & 打卡
// ============================================================

export async function listHabits(instanceId: string) {
  return prisma.habit.findMany({
    where: { appInstanceId: instanceId, isActive: true, deletedAt: null },
    orderBy: { sortOrder: 'asc' },
  });
}

export async function upsertHabit(data: {
  instanceId: string;
  userId: string;
  id?: string;
  name: string;
  version?: number;
}) {
  if (data.id) {
    const existing = await prisma.habit.findUnique({ where: { id: data.id } });
    if (existing) {
      return prisma.habit.update({
        where: { id: data.id },
        data: { name: data.name, version: (data.version ?? existing.version) + 1 },
      });
    }
  }
  return prisma.habit.create({
    data: {
      appInstanceId: data.instanceId,
      userId: data.userId,
      name: data.name,
      version: 1,
    },
  });
}

export async function upsertHabitLog(data: {
  habitId: string;
  userId: string;
  updatedBy: string;
  logDate: string;
  weekKey: string;
  status: 'completed' | 'missed';
  version?: number;
}) {
  return prisma.habitLog.upsert({
    where: {
      habitId_logDate: { habitId: data.habitId, logDate: new Date(data.logDate) },
    },
    create: {
      habitId: data.habitId,
      userId: data.userId,
      logDate: new Date(data.logDate),
      weekKey: data.weekKey,
      status: data.status,
      version: 1,
      updatedBy: data.updatedBy,
    },
    update: {
      status: data.status,
      version: (data.version ?? 1) + 1,
      updatedBy: data.updatedBy,
    },
  });
}

// ============================================================
// 工具函数
// ============================================================

function getWeekInfo(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const year = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year, week };
}
