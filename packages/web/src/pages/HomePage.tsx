// ============================================================
// 首页
// ============================================================

import { useRef, useState, useCallback, useReducer } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Chart,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
} from 'chart.js';
import { useHealthStore } from '@/stores/health.store';
import { useAuthStore } from '@/stores/auth.store';
import { SCORE_LABELS, HABIT_STATUS, type HabitStatusValue } from '@/types/health-record';
import { syncService } from '@/services/sync.service';
import { getWeekKey } from '@/lib/date';

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

interface ToastState {
  message: string;
  visible: boolean;
}

export function HomePage() {
  console.log('HomePage render at', Date.now());
  const navigate = useNavigate();
  const location = useLocation();
  const [toast, setToast] = useState<ToastState>({ message: '', visible: false });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, forceUpdate] = useReducer((x) => x + 1, 0);

  // 根据当前路径确定 activeNav
  const activeNav = location.pathname === '/settings' ? 'settings' 
    : location.pathname === '/data' ? 'data' 
    : 'home';

  const {
    categories,
    fields,
    habits,
    weeks,
    currentWeekIndex,
    setCurrentWeek,
    getCurrentWeekKey,
    weeklyMeta,
    habitLogs,
  } = useHealthStore();

  const weekKey = getWeekKey();  // 直接用 ISO 格式，如 '2026-W14'
  console.log('weekKey:', weekKey);
  const allRecords = useHealthStore((s) => s.records);
  const upsertRecord = useHealthStore((s) => s.upsertRecord);
  const upsertWeeklyMeta = useHealthStore((s) => s.upsertWeeklyMeta);
  const upsertHabitLog = useHealthStore((s) => s.upsertHabitLog);
  const isLoading = useHealthStore((s) => s.isLoading);

  // 本周记录
  const parts = weekKey.split('-W');
  const weekNum = parseInt(parts[1] ?? '1');
  const year = parseInt(parts[0] ?? new Date().getFullYear().toString());
  const records = Array.from(allRecords.values()).filter(
    (r) => r.recordWeek === weekNum && r.recordYear === year && !r.deletedAt
  );
  const meta = weeklyMeta.get(weekKey);
  const { user } = useAuthStore();

  // 获取某习惯打卡状态
  const getHabitLogByWeek = (habitId: string, wk: string) =>
    habitLogs.find((l) => l.habitId === habitId && l.weekKey === wk);

  // 导航
  const navTo = (name: 'home' | 'data' | 'settings') => {
    navigate(`/${name === 'home' ? '' : name}`);
  };

  // Toast
  const showToast = useCallback((msg: string) => {
    setToast({ message: msg, visible: true });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      setToast((t) => ({ ...t, visible: false }));
    }, 2000);
  }, []);

  // BMI 计算
  const calcBMI = (w: string, h: string) => {
    const weight = parseFloat(w);
    const height = parseFloat(h);
    if (!weight || !height || height < 50 || weight < 10) return null;
    return +(weight / Math.pow(height / 100, 2)).toFixed(1);
  };

  const getBMICfg = (bmi: number) => {
    if (bmi < 18.5) return { bar: '#378ADD', bg: '#E6F1FB', fg: '#185FA5', txt: '偏轻' };
    if (bmi < 24) return { bar: '#2E7D52', bg: '#E4F4EB', fg: '#2E7D52', txt: '正常' };
    if (bmi < 28) return { bar: '#BA7517', bg: '#FFF3DC', fg: '#8B5D00', txt: '偏重' };
    return { bar: '#C0392B', bg: '#FDEAEA', fg: '#C0392B', txt: '肥胖' };
  };

  // 体重变更
  const handleWeightChange = async (weight: string) => {
    const parts = weekKey.split('-W');
    const year = parseInt(parts[0] ?? new Date().getFullYear().toString());
    const weekNum = parseInt(parts[1] ?? '1');
    const existingMeta = meta;
    const id = existingMeta?.id ?? crypto.randomUUID();
    const now = new Date().toISOString();

    const updatedMeta = {
      id,
      userId: user?.id ?? 'local',
      weekKey,
      year,
      weekNumber: weekNum,
      weight: parseFloat(weight) || null,
      height: existingMeta?.height ?? null,
      note: existingMeta?.note ?? '',
      version: (existingMeta?.version ?? 0) + 1,
      createdAt: existingMeta?.createdAt ?? now,
      updatedAt: now,
      updatedBy: 'local',
      deletedAt: undefined,
      syncStatus: 'pending' as const,
    };
    await upsertWeeklyMeta(updatedMeta);
    syncService.enqueueChange({
      entityType: 'weekly_meta',
      entityId: id,
      operation: 'update',
      version: updatedMeta.version,
      payload: updatedMeta,
    });
  };

  // 身高变更
  const handleHeightChange = async (height: string) => {
    const parts = weekKey.split('-W');
    const year = parseInt(parts[0] ?? new Date().getFullYear().toString());
    const weekNum = parseInt(parts[1] ?? '1');
    const existingMeta = meta;
    const id = existingMeta?.id ?? crypto.randomUUID();
    const now = new Date().toISOString();

    const updatedMeta = {
      id,
      userId: user?.id ?? 'local',
      weekKey,
      year,
      weekNumber: weekNum,
      weight: existingMeta?.weight ?? null,
      height: parseFloat(height) || null,
      note: existingMeta?.note ?? '',
      version: (existingMeta?.version ?? 0) + 1,
      createdAt: existingMeta?.createdAt ?? now,
      updatedAt: now,
      updatedBy: 'local',
      deletedAt: undefined,
      syncStatus: 'pending' as const,
    };
    await upsertWeeklyMeta(updatedMeta);
    syncService.enqueueChange({
      entityType: 'weekly_meta',
      entityId: id,
      operation: 'update',
      version: updatedMeta.version,
      payload: updatedMeta,
    });
  };

  // 健康评分
  const handleSetHealth = async (fieldId: string, value: 1 | 2 | 3 | 4) => {
    console.log('handleSetHealth called', fieldId, value);
    const parts = weekKey.split('-W');
    const weekNum = parseInt(parts[1] ?? '1');
    const year = parseInt(parts[0] ?? new Date().getFullYear().toString());
    const existingRecord = records.find((r) => r.fieldId === fieldId);
    console.log('existingRecord:', existingRecord, 'weekNum:', weekNum, 'year:', year);
    const id = existingRecord?.id ?? crypto.randomUUID();
    const catId = fields.find((f) => f.id === fieldId)?.categoryId ?? '';
    const newValue = (existingRecord?.value === value ? 0 : value) as 0 | 1 | 2 | 3 | 4;
    console.log('newValue:', newValue);
    const now = new Date().toISOString();
    const userId = user?.id ?? 'local';

    const record = {
      id,
      userId,
      categoryId: catId,
      fieldId,
      recordDate: now.split('T')[0] ?? '',
      recordWeek: weekNum,
      recordYear: year,
      value: newValue,
      version: (existingRecord?.version ?? 0) + 1,
      createdAt: existingRecord?.createdAt ?? now,
      updatedAt: now,
      updatedBy: 'local',
      deletedAt: undefined,
      syncStatus: 'pending' as const,
    };
    console.log('upserting record:', record);
    await upsertRecord(record);
    console.log('upsertRecord done, forcing update');
    forceUpdate();
    syncService.enqueueChange({
      entityType: 'health_record',
      entityId: id,
      operation: 'update',
      version: record.version,
      payload: record,
    });
  };

  // 习惯打卡
  const handleSetHabit = async (habitId: string, value: HabitStatusValue) => {
    const currentLog = getHabitLogByWeek(habitId, weekKey);
    const prevStatus = currentLog?.status;
    const prevValue: HabitStatusValue =
      prevStatus === 'completed' ? HABIT_STATUS.COMPLETED
      : prevStatus === 'missed' ? HABIT_STATUS.MISSED
      : HABIT_STATUS.NONE;

    const nextStatus: HabitStatusValue =
      prevValue === value ? HABIT_STATUS.NONE : value;

    if (nextStatus === HABIT_STATUS.NONE) return;

    const id = currentLog?.id ?? crypto.randomUUID();
    const now = new Date().toISOString();
    const userId = user?.id ?? 'local';

    const log = {
      id,
      habitId,
      userId,
      logDate: now.split('T')[0] ?? '',
      weekKey,
      status: (nextStatus === HABIT_STATUS.COMPLETED ? 'completed' : 'missed') as 'completed' | 'missed',
      version: (currentLog?.version ?? 0) + 1,
      createdAt: currentLog?.createdAt ?? now,
      updatedAt: now,
      updatedBy: 'local',
      syncStatus: 'pending' as const,
    };
    await upsertHabitLog(log);
    syncService.enqueueChange({
      entityType: 'habit_log',
      entityId: id,
      operation: 'update',
      version: log.version,
      payload: log,
    });
  };

  // 保存周备注
  const handleSaveNote = async () => {
    const noteEl = document.getElementById('week-note') as HTMLTextAreaElement;
    const note = noteEl?.value ?? '';
    const parts = weekKey.split('-W');
    const year = parseInt(parts[0] ?? new Date().getFullYear().toString());
    const weekNum = parseInt(parts[1] ?? '1');
    const existingMeta = meta;
    const id = existingMeta?.id ?? crypto.randomUUID();
    const now = new Date().toISOString();
    const userId = user?.id ?? 'local';

    const updatedMeta = {
      id,
      userId,
      weekKey,
      year,
      weekNumber: weekNum,
      weight: existingMeta?.weight ?? null,
      height: existingMeta?.height ?? null,
      note,
      version: (existingMeta?.version ?? 0) + 1,
      createdAt: existingMeta?.createdAt ?? now,
      updatedAt: now,
      updatedBy: 'local',
      deletedAt: undefined,
      syncStatus: 'pending' as const,
    };
    await upsertWeeklyMeta(updatedMeta);
    showToast('本周记录已保存 ✓');
  };

  // 获取某字段当前值
  const getFieldValue = (fieldId: string): number => {
    const record = records.find((r) => r.fieldId === fieldId);
    return record?.value ?? 0;
  };

  // 获取某习惯打卡状态
  const getHabitValue = (habitId: string): HabitStatusValue => {
    const log = getHabitLogByWeek(habitId, weekKey);
    if (!log) return HABIT_STATUS.NONE;
    return log.status === 'completed' ? HABIT_STATUS.COMPLETED : HABIT_STATUS.MISSED;
  };

  const bmi = calcBMI(meta?.weight?.toString() ?? '', meta?.height?.toString() ?? '');
  const bmiCfg = bmi ? getBMICfg(bmi) : null;
  const bmiPct = bmi ? Math.min(96, Math.max(2, (bmi - 14) / 22 * 100)) : 0;

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--brown-light)', fontSize: 14 }}>
        加载中...
      </div>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', flex: '1', overflowY: 'auto' }}>
        {/* Header */}
        <div className="hdr-coral">
          <div className="brand">小鱼健康</div>
          <div className="title">首页</div>
          <div className="sub">Hello，今天你变好了么？</div>
        </div>

        {/* Week Strip */}
        <div className="week-strip">
          {weeks.map((w, i) => (
            <button
              key={w}
              className={`wtab ${i === currentWeekIndex ? 'on' : ''}`}
              onClick={() => setCurrentWeek(i)}
            >
              {w}
            </button>
          ))}
        </div>

        <div className="sbody">
          {/* BMI */}
          <div className="sec-label">体重 · BMI</div>
          <div className="bmi-card">
            <div className="bmi-inputs">
              <div className="bmi-field">
                <label htmlFor="inp-weight">体重 KG</label>
                <input
                  type="number"
                  id="inp-weight"
                  placeholder="65.0"
                  step="0.1"
                  defaultValue={meta?.weight ?? ''}
                  onChange={(e) => handleWeightChange(e.target.value)}
                />
              </div>
              <div className="bmi-field">
                <label htmlFor="inp-height">身高 CM</label>
                <input
                  type="number"
                  id="inp-height"
                  placeholder="170"
                  step="1"
                  defaultValue={meta?.height ?? ''}
                  onChange={(e) => handleHeightChange(e.target.value)}
                />
              </div>
              <div className="bmi-right">
                <div className="bmi-num">{bmi ?? '--'}</div>
                <div
                  className="bmi-tag"
                  style={{
                    background: bmiCfg?.bg ?? 'transparent',
                    color: bmiCfg?.fg ?? 'transparent',
                  }}
                >
                  {bmiCfg?.txt ?? '-'}
                </div>
              </div>
            </div>
            <div className="bmi-bar-track">
              <div
                className="bmi-bar-fill"
                style={{ width: `${bmiPct}%`, background: bmiCfg?.bar ?? 'transparent' }}
              />
            </div>
            <div className="bmi-bar-labels">
              <span>偏轻 &lt;18.5</span>
              <span>正常 18.5–24</span>
              <span>偏重 24–28</span>
              <span>肥胖 &gt;28</span>
            </div>
          </div>

          {/* Health Cards */}
          <div className="sec-label">周健康状态</div>
          {categories.map((cat) => {
            const catFields = fields.filter((f) => f.categoryId === cat.id);
            if (catFields.length === 0) return null;
            return (
              <div className="card" key={cat.id}>
                <div className="card-header">
                  <div className="card-title">{cat.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: cat.color }} />
                    <span className="chevron open" onClick={(e) => {
                      const body = e.currentTarget.closest('.card')?.querySelector('.card-body') as HTMLElement | null;
                      if (body) body.style.display = body.style.display === 'none' ? '' : 'none';
                      e.currentTarget.classList.toggle('open');
                    }}>›</span>
                  </div>
                </div>
                <div className="card-body">
                  {catFields.map((f) => {
                    const v = getFieldValue(f.id);
                    return (
                      <div className="sub-row" key={f.id}>
                        <div className="sub-name">{f.name}</div>
                        <div className="pills-row">
                          {([1, 2, 3, 4] as const).map((n) => {
                            const ac = v === n;
                            return (
                              <div
                                className="pill-item"
                                key={n}
                                onClick={() => handleSetHealth(f.id, n)}
                              >
                                <div className={`np ${ac ? `a${n}` : ''}`}>{n}</div>
                                <span className={`pill-label ${ac ? `a${n}` : ''}`}>
                                  {SCORE_LABELS[n]}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Habits */}
          <div className="sec-label">养生计划打卡</div>
          <div className="card">
            {habits.map((h) => {
              const v = getHabitValue(h.id);
              const completed = v === HABIT_STATUS.COMPLETED;
              const missed = v === HABIT_STATUS.MISSED;
              return (
                <div className="habit-row" key={h.id}>
                  <span className="habit-name">{h.name}</span>
                  <div className="hbtns">
                    <div
                      className={`hbtn ${completed ? 'yes' : ''}`}
                      onClick={() => handleSetHabit(h.id, HABIT_STATUS.COMPLETED)}
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path
                          d="M2 7l4 4 6-6"
                          stroke={completed ? '#fff' : '#C4A090'}
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>
                    <div
                      className={`hbtn ${missed ? 'no' : ''}`}
                      onClick={() => handleSetHabit(h.id, HABIT_STATUS.MISSED)}
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path
                          d="M3 3l8 8M11 3l-8 8"
                          stroke={missed ? '#fff' : '#C4A090'}
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Note */}
          <div className="sec-label">本周备注</div>
          <div className="note-wrap">
            <textarea
              id="week-note"
              rows={3}
              placeholder="记录本周身体感受…"
              defaultValue={meta?.note ?? ''}
            />
          </div>
          <button className="save-btn" onClick={handleSaveNote}>
            保存本周记录
          </button>
        </div>
      </div>

      {/* Bottom Nav */}
      <div className="bottom-nav">
        <button className={`bnav ${activeNav === 'home' ? 'on' : ''}`} onClick={() => navTo('home')}>
          <svg viewBox="0 0 22 22" fill="none">
            <path d="M4 10L11 4l7 6v8h-5v-5H9v5H4v-8z" stroke="currentColor" strokeWidth="1.4" />
          </svg>
          <span>首页</span>
        </button>
        <button className={`bnav ${activeNav === 'data' ? 'on' : ''}`} onClick={() => navTo('data')}>
          <svg viewBox="0 0 22 22" fill="none">
            <polyline points="3,17 7,11 12,14 18,5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <span>数据</span>
        </button>
        <button className={`bnav ${activeNav === 'settings' ? 'on' : ''}`} onClick={() => navTo('settings')}>
          <svg viewBox="0 0 22 22" fill="none">
            <circle cx="11" cy="9" r="3.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M4 19c0-3.9 3.1-7 7-7s7 3.1 7 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <span>设置</span>
        </button>
      </div>

      {/* Toast */}
      <div className={`toast ${toast.visible ? 'show' : ''}`}>{toast.message}</div>
    </>
  );
}
