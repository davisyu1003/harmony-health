// ============================================================
// 首页
// ============================================================

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Chart,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
} from 'chart.js';
import { useHealthStore, getWeekKeyFromLabel } from '@/stores/health.store';
import { useAuthStore } from '@/stores/auth.store';
import { SCORE_LABELS, PILL_CLASSES, HABIT_STATUS, type HabitStatusValue } from '@/types/health-record';
import { syncService } from '@/services/sync.service';

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

const SCORE_COLORS = ['#C4A090', '#2E7D52', '#E67E00', '#CC5500', '#C0392B'];

interface ToastState {
  message: string;
  visible: boolean;
}

export function HomePage() {
  const navigate = useNavigate();
  const [activeNav, setActiveNav] = useState<'home' | 'data' | 'settings'>('home');
  const [toast, setToast] = useState<ToastState>({ message: '', visible: false });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    categories,
    fields,
    habits,
    habitLogs,
    weeks,
    currentWeekIndex,
    setCurrentWeek,
    getCurrentWeekKey,
    getRecordsByWeek,
    getMetaByWeek,
    getHabitLogByWeek,
    upsertRecord,
    upsertWeeklyMeta,
    upsertHabitLog,
    isLoading,
  } = useHealthStore();

  // 当前选中周
  const weekLabel = weeks[currentWeekIndex] ?? '';
  const weekKey = getCurrentWeekKey();
  const records = getRecordsByWeek(weekKey);
  const meta = getMetaByWeek(weekKey);

  // 导航
  const navTo = (name: 'home' | 'data' | 'settings') => {
    setActiveNav(name);
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

  // 体重/身高变更
  const handleWeightChange = async (weight: string) => {
    const currentMeta = meta ?? {
      id: crypto.randomUUID(),
      userId: useAuthStore.getState().user?.id ?? 'local',
      weekKey,
      year: parseInt(weekKey.split('-')[0] ?? new Date().getFullYear().toString()),
      weekNumber: parseInt(weekKey.split('-W')[1] ?? '1'),
      weight: null,
      height: null,
      note: '',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: 'local',
      syncStatus: 'pending' as const,
    };
    await upsertWeeklyMeta({
      ...currentMeta,
      weight: parseFloat(weight) || null,
      updatedAt: new Date().toISOString(),
      version: currentMeta.version + 1,
      syncStatus: 'pending',
    });
    // 同步
    syncService.enqueueChange({ entityType: 'weekly_meta', entityId: currentMeta.id, operation: 'update', version: currentMeta.version + 1, payload: { weight } });
  };

  const handleHeightChange = async (height: string) => {
    const currentMeta = meta ?? {
      id: crypto.randomUUID(),
      userId: useAuthStore.getState().user?.id ?? 'local',
      weekKey,
      year: parseInt(weekKey.split('-')[0] ?? new Date().getFullYear().toString()),
      weekNumber: parseInt(weekKey.split('-W')[1] ?? '1'),
      weight: null,
      height: null,
      note: '',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: 'local',
      syncStatus: 'pending' as const,
    };
    await upsertWeeklyMeta({
      ...currentMeta,
      height: parseFloat(height) || null,
      updatedAt: new Date().toISOString(),
      version: currentMeta.version + 1,
      syncStatus: 'pending',
    });
  };

  // 健康评分
  const handleSetHealth = async (fieldId: string, value: 0 | 1 | 2 | 3 | 4) => {
    const weekNum = parseInt(weekKey.split('-W')[1] ?? '1');
    const year = parseInt(weekKey.split('-')[0] ?? new Date().getFullYear().toString());
    const existingRecord = records.find((r) => r.fieldId === fieldId);
    const id = existingRecord?.id ?? crypto.randomUUID();
    const userId = useAuthStore.getState().user?.id ?? 'local';

    const newValue = (existingRecord?.value === value ? 0 : value) as 0 | 1 | 2 | 3 | 4;

    const record = {
      id,
      userId,
      categoryId: fields.find((f) => f.id === fieldId)?.categoryId ?? '',
      fieldId,
      recordDate: new Date().toISOString().split('T')[0] ?? '',
      recordWeek: weekNum,
      recordYear: year,
      value: newValue,
      version: (existingRecord?.version ?? 0) + 1,
      createdAt: existingRecord?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: 'local',
      deletedAt: undefined,
      syncStatus: 'pending' as const,
    };
    await upsertRecord(record);
    syncService.enqueueChange({ entityType: 'health_record', entityId: id, operation: 'update', version: record.version, payload: record });
  };

  // 习惯打卡
  const handleSetHabit = async (habitId: string, value: HabitStatusValue) => {
    const currentLog = getHabitLogByWeek(habitId, weekKey);
    const newStatus = (currentLog?.status === (value === 1 ? 'completed' : 'missed') ? 'none' : (value === 1 ? 'completed' : 'missed')) as HabitStatusValue;
    if (newStatus === HABIT_STATUS.NONE) return;

    const log = {
      id: currentLog?.id ?? crypto.randomUUID(),
      habitId,
      userId: useAuthStore.getState().user?.id ?? 'local',
      logDate: new Date().toISOString().split('T')[0] ?? '',
      weekKey,
      status: newStatus === HABIT_STATUS.COMPLETED ? 'completed' : 'missed',
      version: (currentLog?.version ?? 0) + 1,
      createdAt: currentLog?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: 'local',
      syncStatus: 'pending' as const,
    };
    await upsertHabitLog(log);
    syncService.enqueueChange({ entityType: 'habit_log', entityId: log.id, operation: 'update', version: log.version, payload: log });
  };

  // 保存周备注
  const handleSaveNote = async () => {
    const noteEl = document.getElementById('week-note') as HTMLTextAreaElement;
    const note = noteEl?.value ?? '';
    const currentMeta = meta ?? {
      id: crypto.randomUUID(),
      userId: useAuthStore.getState().user?.id ?? 'local',
      weekKey,
      year: parseInt(weekKey.split('-')[0] ?? new Date().getFullYear().toString()),
      weekNumber: parseInt(weekKey.split('-W')[1] ?? '1'),
      weight: null,
      height: null,
      note: '',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: 'local',
      syncStatus: 'pending' as const,
    };
    await upsertWeeklyMeta({
      ...currentMeta,
      note,
      updatedAt: new Date().toISOString(),
      version: currentMeta.version + 1,
      syncStatus: 'pending',
    });
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
      <div className="screen active" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--brown-light)', fontSize: 14 }}>加载中...</div>
      </div>
    );
  }

  return (
    <>
      {/* HOME SCREEN */}
      <div className="screen active" id="s-home">
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
                <label>体重 KG</label>
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
                <label>身高 CM</label>
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
          <div id="health-cards">
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
                        const body = e.currentTarget.closest('.card')?.querySelector('.card-body') as HTMLElement;
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
                              const cls = ac ? ` np a${n}` : ' np';
                              return (
                                <div
                                  className="pill-item"
                                  key={n}
                                  onClick={() => handleSetHealth(f.id, n as 1 | 2 | 3 | 4)}
                                >
                                  <div className={cls}>{n}</div>
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
          </div>

          {/* Habits */}
          <div className="sec-label">养生计划打卡</div>
          <div className="card" id="habit-card">
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
