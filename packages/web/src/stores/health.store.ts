// ============================================================
// 健康数据状态管理
// ============================================================

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { db } from '@/db/schema';
import { getWeekKey } from '@/lib/date';
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
  const now = new Date();
  const currentYear = now.getFullYear();

  // Find first Monday of year (ISO week starts on Monday)
  const jan1 = new Date(currentYear, 0, 1);
  const dayOfWeek = jan1.getDay();
  const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const firstMonday = new Date(jan1);
  firstMonday.setDate(jan1.getDate() + daysToMonday);

  // Find this week's Monday (used to find current week index)
  const today = new Date(now);
  const todayDayOfWeek = today.getDay() === 0 ? 7 : today.getDay();
  const daysToPrevMonday = 1 - todayDayOfWeek;
  const currentWeekMonday = new Date(today);
  currentWeekMonday.setDate(today.getDate() + daysToPrevMonday);

  const weeks: string[] = [];
  const fmt = (n: number) => n.toString().padStart(2, '0');

  // Generate ~52 weeks from first Monday of year
  const startOfYearMonday = new Date(firstMonday);
  
  for (let i = 0; i < 52; i++) {
    const monday = new Date(startOfYearMonday);
    monday.setDate(startOfYearMonday.getDate() + 7 * i);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    // Skip weeks that are completely in the previous year
    if (sunday.getFullYear() < currentYear) continue;
    // Skip weeks that are completely in the next year (week 53+)
    if (monday.getFullYear() > currentYear) break;

    const weekNum = i + 1;

    weeks.push(`W${weekNum} ${fmt(monday.getMonth() + 1)}/${fmt(monday.getDate())}–${fmt(sunday.getMonth() + 1)}/${fmt(sunday.getDate())}`);
  }

  return weeks;
}

// Check if a week label is "this week" based on actual date
function isCurrentWeekLabel(label: string): boolean {
  const today = new Date();
  const todayDayOfWeek = today.getDay() === 0 ? 7 : today.getDay();
  const daysToPrevMonday = 1 - todayDayOfWeek;
  const currentWeekMonday = new Date(today);
  currentWeekMonday.setDate(today.getDate() + daysToPrevMonday);

  const parts = label.split(' ');
  if (!parts[1]) return false;
  const range = parts[1].split('–');
  const startStr = range[0];
  if (!startStr) return false;
  
  const dateParts = startStr.split('/');
  const m1Str = dateParts[0];
  const d1Str = dateParts[1];
  if (!m1Str || !d1Str) return false;
  
  const m1 = parseInt(m1Str);
  const d1 = parseInt(d1Str);
  
  // Determine year - handle year boundary
  let year = today.getFullYear();
  if (m1 === 12 && d1 >= 29) {
    const mondayOfLabel = new Date(year, m1 - 1, d1);
    if (today < mondayOfLabel) year = year + 1;
  }
  
  const labelMonday = new Date(year, m1 - 1, d1);
  const diff = Math.abs(currentWeekMonday.getTime() - labelMonday.getTime());
  return diff < 3 * 24 * 60 * 60 * 1000; // within 3 days
}

// Find the index of "this week" in the weeks array
function findCurrentWeekIndex(weeks: string[]): number {
  for (let i = 0; i < weeks.length; i++) {
    const weekLabel = weeks[i];
    if (weekLabel && isCurrentWeekLabel(weekLabel)) {
      return i;
    }
  }
  return weeks.length - 1; // fallback to last week
}

function weekLabelToKey(label: string): string {
  const part0 = label.split(' ')[0];
  const part1 = label.split(' ')[1];
  if (!part0 || !part1) return getWeekKey();
  
  const weekMatch = part0.match(/W(\d+)/);
  if (!weekMatch) return getWeekKey();
  const weekNumStr = weekMatch[1];
  if (!weekNumStr) return getWeekKey();
  
  const range0 = part1.split('–')[0];
  if (!range0) return getWeekKey();
  
  const monthStr = range0.split('/')[0];
  const dayStr = range0.split('/')[1];
  if (!monthStr || !dayStr) return getWeekKey();
  
  const month = parseInt(monthStr);
  const day = parseInt(dayStr);
  if (isNaN(month) || isNaN(day)) return getWeekKey();
  
  let year = new Date().getFullYear();
  if (month === 12 && day >= 29) {
    const mondayOfLabel = new Date(year, month - 1, day);
    if (new Date() < mondayOfLabel) year = year + 1;
  }
  
  const mondayDate = new Date(year, month - 1, day);
  return getWeekKey(mondayDate);
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
          const currentWeekIndex = findCurrentWeekIndex(weeks);

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
        const currentIndex = findCurrentWeekIndex(weeks);
        set({ weeks, currentWeekIndex: currentIndex });
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
