// ============================================================
// 健康记录类型定义
// ============================================================

export type RecordType = 'vital' | 'activity' | 'medication' | 'meal' | 'custom';

export interface HealthCategory {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface HealthField {
  id: string;
  categoryId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  deletedAt?: string;
}

export interface HealthRecord {
  id: string;
  userId: string;
  categoryId: string;
  fieldId: string;
  recordDate: string; // ISO date
  recordWeek: number; // ISO week number
  recordYear: number;
  value: 0 | 1 | 2 | 3 | 4; // 0=未选, 1=完全恢复, 2=轻微, 3=加重, 4=严重
  version: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  deletedAt?: string;
  // 本地离线状态
  syncStatus: 'synced' | 'pending' | 'conflict' | 'failed';
}

export interface WeeklyMeta {
  id: string;
  userId: string;
  weekKey: string; // '2026-W13'
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

// ============================================================
// 习惯打卡
// ============================================================

export interface Habit {
  id: string;
  userId: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface HabitLog {
  id: string;
  habitId: string;
  userId: string;
  logDate: string; // ISO date
  weekKey: string; // '2026-W13'
  status: 'completed' | 'missed';
  version: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  syncStatus: 'synced' | 'pending' | 'conflict' | 'failed';
}

// ============================================================
// 评分系统
// ============================================================

export const SCORE_LABELS = ['未选', '完全恢复', '轻微不适', '不适加重', '问题严重'] as const;
export const SCORE_COLORS = ['#C4A090', '#2E7D52', '#E67E00', '#CC5500', '#C0392B'] as const;

export const PILL_CLASSES: Record<number, string> = {
  0: '',
  1: 'a1',
  2: 'a2',
  3: 'a3',
  4: 'a4',
};

export const HABIT_STATUS = {
  NONE: 0,
  COMPLETED: 1,
  MISSED: 2,
} as const;
export type HabitStatusValue = (typeof HABIT_STATUS)[keyof typeof HABIT_STATUS];
