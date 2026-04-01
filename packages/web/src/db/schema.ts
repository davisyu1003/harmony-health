// ============================================================
// IndexedDB Schema (Dexie)
// ============================================================

import Dexie, { type Table } from 'dexie';

export interface DBHealthCategory {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  // 本地元数据
  version: number;
  syncStatus: 'synced' | 'pending' | 'conflict' | 'failed';
}

export interface DBHealthField {
  id: string;
  categoryId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  deletedAt?: string;
  version: number;
  syncStatus: 'synced' | 'pending' | 'conflict' | 'failed';
}

export interface DBHealthRecord {
  id: string;
  userId: string;
  categoryId: string;
  fieldId: string;
  recordDate: string;
  recordWeek: number;
  recordYear: number;
  value: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  deletedAt?: string;
  syncStatus: 'synced' | 'pending' | 'conflict' | 'failed';
}

export interface DBWeeklyMeta {
  id: string;
  userId: string;
  weekKey: string;
  year: number;
  weekNumber: number;
  weight: number | null;
  height: number | null;
  note: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  deletedAt?: string;
  syncStatus: 'synced' | 'pending' | 'conflict' | 'failed';
}

export interface DBHabit {
  id: string;
  userId: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  version: number;
  syncStatus: 'synced' | 'pending' | 'conflict' | 'failed';
}

export interface DBHabitLog {
  id: string;
  habitId: string;
  userId: string;
  logDate: string;
  weekKey: string;
  status: 'completed' | 'missed';
  version: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  syncStatus: 'synced' | 'pending' | 'conflict' | 'failed';
}

export interface DBPendingChange {
  id: string;
  entityType: string;
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  payload: unknown;
  timestamp: string;
  retryCount: number;
  status: 'pending' | 'in-progress' | 'failed';
}

export interface DBSyncState {
  id: string; // 固定为 'main'
  lastSyncAt: string;
  serverTime: string;
  deviceId: string;
}

export class HealthAppDB extends Dexie {
  categories!: Table<DBHealthCategory>;
  fields!: Table<DBHealthField>;
  healthRecords!: Table<DBHealthRecord>;
  weeklyMeta!: Table<DBWeeklyMeta>;
  habits!: Table<DBHabit>;
  habitLogs!: Table<DBHabitLog>;
  pendingChanges!: Table<DBPendingChange>;
  syncState!: Table<DBSyncState>;

  constructor() {
    super('HealthAppDB');
    this.version(1).stores({
      categories: 'id, sortOrder, syncStatus, deletedAt',
      fields: 'id, categoryId, sortOrder, syncStatus, deletedAt',
      healthRecords: 'id, userId, categoryId, fieldId, recordDate, recordWeek, recordYear, syncStatus, deletedAt',
      weeklyMeta: 'id, userId, weekKey, syncStatus',
      habits: 'id, userId, isActive, sortOrder, syncStatus, deletedAt',
      habitLogs: 'id, habitId, userId, logDate, weekKey, syncStatus',
      pendingChanges: 'id, entityType, entityId, status, timestamp',
      syncState: 'id',
    });
  }
}

export const db = new HealthAppDB();
