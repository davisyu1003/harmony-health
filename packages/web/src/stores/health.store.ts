// ============================================================
// 健康数据状态管理
// ============================================================

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist, createJSONStorage } from 'zustand/middleware';
import { db } from '@/db/schema';
import type {
  DBHealthCategory,
  DBHealthField,
  DBHealthRecord,
  DBWeeklyMeta,
  DBHabit,
  DBHabitLog,
} from '@/db/schema';
import { getWeekKey, getISOWeek, getISOYear } from '@/lib/date';

// ============================================================
// 默认健康分类（v1 参考）
// ============================================================

export const DEFAULT_CATEGORIES: Omit<DBHealthCategory, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'syncStatus'>[] = [
  { name: '精力与睡眠', color: '#1D9E75', sortOrder: 0, deletedAt: undefined },
  { name: '神经与情绪', color: '#7F77DD', sortOrder: 1, deletedAt: undefined },
  { name: '消化与代谢', color: '#BA7517', sortOrder: 2, deletedAt: undefined },
  { name: '骨骼与肌肉', color: '#D4537E', sortOrder: 3, deletedAt: undefined },
];

export const DEFAULT_FIELDS: Omit<DBHealthField, 'id' | 'createdAt' | 'sortOrder' | 'version' | 'syncStatus' | 'deletedAt'>[] = [
  // 精力与睡眠
  { categoryId: 'c1', name: '起床/午睡困难' },
  { categoryId: 'c1', name: '头脑昏沉' },
  { categoryId: 'c1', name: '午后困顿' },
  { categoryId: 'c1', name: '入睡困难' },
  { categoryId: 'c1', name: '夜晚盗汗' },
  // 神经与情绪
  { categoryId: 'c2', name: '易怒/急躁' },
  { categoryId: 'c2', name: '耳鸣' },
  { categoryId: 'c2', name: '心脏悸动' },
  { categoryId: 'c2', name: '记忆力减退' },
  // 消化与代谢
  { categoryId: 'c3', name: '肚子胀气' },
  { categoryId: 'c3', name: '运动/讲话出汗' },
  { categoryId: 'c3', name: '吃饭后暴汗' },
  // 骨骼与肌肉
  { categoryId: 'c4', name: '膝软' },
  { categoryId: 'c4', name: '腰痛' },
];

// ============================================================
// 健康 Store
// ============================================================

interface HealthState {
  categories: DBHealthCategory[];
  fields: DBHealthField[];
  records: Map<string, DBHealthRecord>; // id → record
  weeklyMeta: Map<string, DBWeeklyMeta>; // weekKey → meta
  habits: DBHabit[];
  habitLogs: DBHabitLog[];
  isLoading: boolean;
  currentWeekIndex: number; // 0-4
  weeks: string[]; // W1 W05/01-W05/07 等

  // Actions
  init: () => Promise<void>;
  loadWeeks: () => void;
  setCurrentWeek: (index: number) => void;
  getCurrentWeekKey: () => string;
  upsertRecord: (record: DBHealthRecord) => Promise<void>;
  upsertWeeklyMeta: (meta: DBWeeklyMeta) => Promise<void>;
  upsertHabit: (habit: DBHabit) => Promise<void>;
  upsertHabitLog: (log: DBHabitLog) => Promise<void>;
  deleteHabit: (id: string) => Promise<void>;
  addCategory: (cat: Omit<DBHealthCategory, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'syncStatus'>) => Promise<void>;
  addField: (catId: string, name: string) => Promise<void>;
  deleteField: (id: string) => Promise<void>;
  getRecordsByWeek: (weekKey: string) => DBHealthRecord[];
  getMetaByWeek: (weekKey: string) => DBWeeklyMeta | undefined;
  getHabitLogByWeek: (habitId: string, weekKey: string) => DBHabitLog | undefined;
}

// 近5周的周键列表（与 v1 一致）
function buildWeeks(): string[] {
  const d = new Date();
  const base = new Date(d);
  base.setDate(base.getDate() - base.getDay() + 1); // 周一

  const weeks: string[] = [];
  for (let i = 4; i >= 0; i--) {
    const start = new Date(base);
    start.setDate(start.getDate() - 7 * i);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const fmt = (n: number) => n.toString().padStart(2, '0');
    weeks.push(`W${5 - i} ${fmt(start.getMonth() + 1)}/${fmt(start.getDate())}–${fmt(end.getMonth() + 1)}/${fmt(end.getDate())}`);
  }
  return weeks;
}

function getCurrentWeekIndex(weeks: string[]): number {
  return weeks.length - 1; // 默认选中当前周
}

function getWeekKeyFromLabel(label: string): string {
  // label 格式: "W1 04/01-04/07"
  const parts = label.split(' ');
  const weekNum = parseInt(parts[0]?.replace('W', '') ?? '1');
  const datePart = parts[1]?.split('-')[0] ?? '01/01';
  const [month, day] = datePart.split('/').map(Number);
  const year = new Date().getFullYear();
  const d = new Date(year, month - 1, day);
  return `${year}-W${weekNum.toString().padStart(2, '0')}`;
}

export const useHealthStore = create<HealthState>()(
  persist(
    (set, get) => ({
      categories: [],
      fields: [],
      records: new Map(),
      weeklyMeta: new Map(),
      habits: [],
      habitLogs: [],
      isLoading: false,
      currentWeekIndex: 4,
      weeks: [],

      init: async () => {
        set({ isLoading: true });
        try {
          const [cats, flds, recs, metas, habs, logs] = await Promise.all([
            db.categories.where('deletedAt').equals('').toArray().catch(() => db.categories.toArray()),
            db.fields.where('deletedAt').equals('').toArray().catch(() => db.fields.toArray()),
            db.healthRecords.toArray(),
            db.weeklyMeta.toArray(),
            db.habits.where('deletedAt').equals('').toArray().catch(() => db.habits.toArray()),
            db.habitLogs.toArray(),
          ]);

          const weeks = buildWeeks();
          const currentWeekIndex = getCurrentWeekIndex(weeks);

          set({
            categories: cats,
            fields: flds,
            records: new Map(recs.map((r) => [r.id, r])),
            weeklyMeta: new Map(metas.map((m) => [m.weekKey, m])),
            habits: habs.filter((h) => h.isActive),
            habitLogs: logs,
            weeks,
            currentWeekIndex,
            isLoading: false,
          });

          // 首次使用：初始化默认分类和字段
          if (cats.length === 0) {
            await initDefaultData(get);
          }
        } catch (error) {
          console.error('Failed to init health store:', error);
          set({ isLoading: false });
        }
      },

      loadWeeks: () => {
        const weeks = buildWeeks();
        set({ weeks, currentWeekIndex: getCurrentWeekIndex(weeks) });
      },

      setCurrentWeek: (index) => set({ currentWeekIndex: index }),

      getCurrentWeekKey: () => {
        const { weeks, currentWeekIndex } = get();
        return weeks[currentWeekIndex] ? getWeekKeyFromLabel(weeks[currentWeekIndex]) : '';
      },

      upsertRecord: async (record) => {
        await db.healthRecords.put(record);
        set((state) => ({
          records: new Map(state.records).set(record.id, record),
        }));
      },

      upsertWeeklyMeta: async (meta) => {
        await db.weeklyMeta.put(meta);
        set((state) => ({
          weeklyMeta: new Map(state.weeklyMeta).set(meta.weekKey, meta),
        }));
      },

      upsertHabit: async (habit) => {
        await db.habits.put(habit);
        set((state) => {
          const idx = state.habits.findIndex((h) => h.id === habit.id);
          const habits = idx >= 0
            ? [...state.habits.slice(0, idx), habit, ...state.habits.slice(idx + 1)]
            : [...state.habits, habit];
          return { habits };
        });
      },

      upsertHabitLog: async (log) => {
        await db.habitLogs.put(log);
        set((state) => {
          const idx = state.habitLogs.findIndex(
            (l) => l.habitId === log.habitId && l.weekKey === log.weekKey
          );
          const habitLogs = idx >= 0
            ? [...state.habitLogs.slice(0, idx), log, ...state.habitLogs.slice(idx + 1)]
            : [...state.habitLogs, log];
          return { habitLogs };
        });
      },

      deleteHabit: async (id) => {
        const now = new Date().toISOString();
        await db.habits.update(id, { deletedAt: now, isActive: false });
        set((state) => ({
          habits: state.habits.filter((h) => h.id !== id),
        }));
      },

      addCategory: async (cat) => {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const newCat: DBHealthCategory = {
          ...cat,
          id,
          createdAt: now,
          updatedAt: now,
          version: 1,
          syncStatus: 'pending',
        };
        await db.categories.add(newCat);
        set((state) => ({ categories: [...state.categories, newCat] }));
      },

      addField: async (catId, name) => {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const fields = get().fields.filter((f) => f.categoryId === catId);
        const newField: DBHealthField = {
          id,
          categoryId: catId,
          name,
          sortOrder: fields.length,
          createdAt: now,
          version: 1,
          syncStatus: 'pending',
        };
        await db.fields.add(newField);
        set((state) => ({ fields: [...state.fields, newField] }));
      },

      deleteField: async (id) => {
        const now = new Date().toISOString();
        await db.fields.update(id, { deletedAt: now });
        set((state) => ({
          fields: state.fields.filter((f) => f.id !== id),
        }));
      },

      getRecordsByWeek: (weekKey) => {
        const { records } = get();
        const weekNum = parseInt(weekKey.split('-W')[1] ?? '1');
        const year = parseInt(weekKey.split('-')[0] ?? new Date().getFullYear().toString());
        return Array.from(records.values()).filter(
          (r) => r.recordWeek === weekNum && r.recordYear === year && !r.deletedAt
        );
      },

      getMetaByWeek: (weekKey) => get().weeklyMeta.get(weekKey),

      getHabitLogByWeek: (habitId, weekKey) =>
        get().habitLogs.find((l) => l.habitId === habitId && l.weekKey === weekKey),
    }),
    {
      name: 'harmony-health',
      storage: createJSONStorage(() => localStorage),
      // 只持久化元数据，不持久化 records Map（太大，通过 IndexedDB 管理）
      partialize: (state) => ({
        categories: state.categories,
        fields: state.fields,
        habits: state.habits,
        weeks: state.weeks,
        currentWeekIndex: state.currentWeekIndex,
      }),
    }
  )
);

// ============================================================
// 初始化默认数据
// ============================================================

async function initDefaultData(get: () => HealthState) {
  const now = new Date().toISOString();

  // 添加默认分类
  for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
    const catData = DEFAULT_CATEGORIES[i];
    const id = `c${i + 1}`;
    const cat: DBHealthCategory = {
      ...catData,
      id,
      createdAt: now,
      updatedAt: now,
      version: 1,
      syncStatus: 'synced',
    };
    await db.categories.add(cat);
    get().categories.push(cat);

    // 添加该分类下的字段
    const catFields = DEFAULT_FIELDS.filter((f) => f.categoryId === id);
    for (let j = 0; j < catFields.length; j++) {
      const fld = catFields[j];
      const fldId = `f${DEFAULT_CATEGORIES.slice(0, i).reduce((s, c) => s + (c === catData ? 0 : 1), 0) + j + 1 + DEFAULT_FIELDS.filter((f) => f.categoryId === catId).indexOf(fld)}`;
      const fieldId = `f${i * 5 + j + 1}`;
      const field: DBHealthField = {
        id: fieldId,
        categoryId: id,
        name: fld.name,
        sortOrder: j,
        createdAt: now,
        version: 1,
        syncStatus: 'synced',
      };
      await db.fields.add(field);
      get().fields.push(field);
    }
  }
}

export { getWeekKeyFromLabel };
