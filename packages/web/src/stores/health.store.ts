// ============================================================
// 健康数据状态管理
// ============================================================

import { create } from 'zustand';
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

// ============================================================
// 默认健康分类（v1 参考）
// ============================================================

export const DEFAULT_CATEGORIES: Array<{ name: string; color: string; sortOrder: number }> = [
  { name: '精力与睡眠', color: '#1D9E75', sortOrder: 0 },
  { name: '神经与情绪', color: '#7F77DD', sortOrder: 1 },
  { name: '消化与代谢', color: '#BA7517', sortOrder: 2 },
  { name: '骨骼与肌肉', color: '#D4537E', sortOrder: 3 },
];

export const DEFAULT_FIELDS: Array<{ categoryId: string; name: string }> = [
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
  records: Map<string, DBHealthRecord>;
  weeklyMeta: Map<string, DBWeeklyMeta>;
  habits: DBHabit[];
  habitLogs: DBHabitLog[];
  isLoading: boolean;
  currentWeekIndex: number;
  weeks: string[];
  _initialized: boolean;

  init: () => Promise<void>;
  loadWeeks: () => void;
  setCurrentWeek: (index: number) => void;
  getCurrentWeekKey: () => string;
  upsertRecord: (record: DBHealthRecord) => Promise<void>;
  upsertWeeklyMeta: (meta: DBWeeklyMeta) => Promise<void>;
  upsertHabit: (habit: DBHabit) => Promise<void>;
  upsertHabitLog: (log: DBHabitLog) => Promise<void>;
  deleteHabit: (id: string) => Promise<void>;
  addCategory: (cat: { name: string; color: string; sortOrder: number }) => Promise<void>;
  addField: (catId: string, name: string) => Promise<void>;
  deleteField: (id: string) => Promise<void>;
  getRecordsByWeek: (weekKey: string) => DBHealthRecord[];
  getMetaByWeek: (weekKey: string) => DBWeeklyMeta | undefined;
  getHabitLogByWeek: (habitId: string, weekKey: string) => DBHabitLog | undefined;
}

function buildWeeks(): string[] {
  const d = new Date();
  const base = new Date(d);
  base.setDate(base.getDate() - base.getDay() + 1);

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

function weekLabelToKey(label: string): string {
  const parts = label.split(' ');
  if (!parts[1]) return '';
  const range = (parts[1] ?? '').split('-');
  const startStr = range[0] ?? '01/01';
  const [month, day] = startStr.split('/').map(Number);
  const year = new Date().getFullYear();
  const d = new Date(year, (month ?? 1) - 1, day ?? 1);
  const d2 = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d2.setUTCDate(d2.getUTCDate() + 4 - (d2.getUTCDay() || 7));
  const isoYear = d2.getUTCFullYear();
  const isoWeek = Math.ceil(((d2.getTime() - new Date(Date.UTC(isoYear, 0, 1)).getTime()) / 86400000 + 1) / 7);
  return `${isoYear}-W${isoWeek.toString().padStart(2, '0')}`;
}

function createDefaultWeeklyMeta(weekKey: string): DBWeeklyMeta {
  const parts = weekKey.split('-W');
  const year = parseInt(parts[0] ?? new Date().getFullYear().toString());
  const weekNum = parseInt(parts[1] ?? '1');
  return {
    id: crypto.randomUUID(),
    userId: 'local',
    weekKey,
    year,
    weekNumber: weekNum,
    weight: null,
    height: null,
    note: '',
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    updatedBy: 'local',
    syncStatus: 'pending',
  };
}

async function initDefaultData(state: HealthState): Promise<void> {
  const now = new Date().toISOString();
  const cats: DBHealthCategory[] = [];
  const flds: DBHealthField[] = [];

  for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
    const catData = DEFAULT_CATEGORIES[i]!;
    const id = `c${i + 1}`;
    const cat: DBHealthCategory = {
      id,
      name: catData.name,
      color: catData.color,
      sortOrder: catData.sortOrder,
      createdAt: now,
      updatedAt: now,
      version: 1,
      syncStatus: 'synced',
    };
    await db.categories.add(cat);
    cats.push(cat);

    const catFields = DEFAULT_FIELDS.filter((f) => f.categoryId === id);
    for (let j = 0; j < catFields.length; j++) {
      const fld = catFields[j]!;
      const field: DBHealthField = {
        id: `f${i * 5 + j + 1}`,
        categoryId: id,
        name: fld.name,
        sortOrder: j,
        createdAt: now,
        version: 1,
        syncStatus: 'synced',
      };
      await db.fields.add(field);
      flds.push(field);
    }
  }

  // 初始化默认习惯
  const defaultHabits: Array<{ name: string }> = [
    { name: '每日冥想 10 分钟' },
    { name: '戒含糖饮料' },
    { name: '睡前拉伸 15 分钟' },
  ];
  const habits: DBHabit[] = [];
  for (let i = 0; i < defaultHabits.length; i++) {
    const h: DBHabit = {
      id: `h${i + 1}`,
      userId: 'local',
      name: defaultHabits[i]!.name,
      isActive: true,
      sortOrder: i,
      createdAt: now,
      updatedAt: now,
      version: 1,
      syncStatus: 'synced',
    };
    await db.habits.add(h);
    habits.push(h);
  }

  // 初始化本周 meta
  const weeks = buildWeeks();
  const currentWeek = weeks[weeks.length - 1] ?? weeks[0];
  if (currentWeek) {
    const weekKey = weekLabelToKey(currentWeek);
    if (weekKey) {
      const meta = createDefaultWeeklyMeta(weekKey);
      await db.weeklyMeta.add(meta);
      state.weeklyMeta.set(weekKey, meta);
    }
  }

  state.categories = cats;
  state.fields = flds;
  state.habits = habits;
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
      _initialized: false,

      init: async () => {
        if (get()._initialized) return;
        set({ isLoading: true });
        try {
          const [cats, flds, recs, metas, habs, logs] = await Promise.all([
            db.categories.toArray(),
            db.fields.toArray(),
            db.healthRecords.toArray(),
            db.weeklyMeta.toArray(),
            db.habits.toArray(),
            db.habitLogs.toArray(),
          ]);

          const weeks = buildWeeks();
          const currentWeekIndex = weeks.length - 1;

          set({
            categories: cats.filter((c) => !c.deletedAt),
            fields: flds.filter((f) => !f.deletedAt),
            records: new Map(recs.map((r) => [r.id, r])),
            weeklyMeta: new Map(metas.map((m) => [m.weekKey, m])),
            habits: habs.filter((h) => h.isActive && !h.deletedAt),
            habitLogs: logs,
            weeks,
            currentWeekIndex,
            isLoading: false,
            _initialized: true,
          });

          if (cats.length === 0) {
            await initDefaultData(get());
          }
        } catch (error) {
          console.error('Failed to init health store:', error);
          set({ isLoading: false });
        }
      },

      loadWeeks: () => {
        const weeks = buildWeeks();
        set({ weeks, currentWeekIndex: weeks.length - 1 });
      },

      setCurrentWeek: (index) => set({ currentWeekIndex: index }),

      getCurrentWeekKey: () => {
        const { weeks, currentWeekIndex } = get();
        const label = weeks[currentWeekIndex] ?? '';
        return weekLabelToKey(label);
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
          id,
          name: cat.name,
          color: cat.color,
          sortOrder: cat.sortOrder,
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
        const parts = weekKey.split('-W');
        const weekNum = parseInt(parts[1] ?? '1');
        const year = parseInt(parts[0] ?? new Date().getFullYear().toString());
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
