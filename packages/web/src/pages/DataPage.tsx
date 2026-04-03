// ============================================================
// 数据中心页 - 重构版
// 本周：健康评分平均分+环比，习惯达成列表
// 本月：四周折线图，习惯达成率
// ============================================================

import { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Chart,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { useHealthStore } from '@/stores/health.store';

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

// 获取当前周是第几周（ISO）
function getCurrentWeekNumber(): number {
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now.getTime() - jan1.getTime()) / (24 * 60 * 60 * 1000));
  return Math.ceil((days + jan1.getDay() + 1) / 7);
}

// 获取当前月有哪几周（通常4-5周）
function getWeeksOfCurrentMonth(): string[] {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const weeks: { label: string; weekNum: number; year: number }[] = [];

  // 遍历月内所有天，找到每个周一
  const visited = new Set<string>();
  for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay();
    if (dayOfWeek === 1) { // 周一
      const wYear = d.getFullYear();
      const jan1 = new Date(wYear, 0, 1);
      const days = Math.floor((d.getTime() - jan1.getTime()) / (24 * 60 * 60 * 1000));
      const weekNum = Math.ceil((days + jan1.getDay() + 1) / 7);
      const label = `${wYear}-W${weekNum.toString().padStart(2, '0')}`;
      if (!visited.has(label)) {
        visited.add(label);
        const fmt = (n: number) => n.toString().padStart(2, '0');
        const sunday = new Date(d);
        sunday.setDate(d.getDate() + 6);
        weeks.push({
          label: `W${weekNum} ${fmt(d.getMonth() + 1)}/${fmt(d.getDate())}-${fmt(sunday.getMonth() + 1)}/${fmt(sunday.getDate())}`,
          weekNum,
          year: wYear,
        });
      }
    }
  }
  return weeks.map(w => w.label);
}

// 计算指定周和年的分类平均分
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function calcCategoryAvgForWeek(catId: string, weekNum: number, year: number, allRecords: any[], fields: { id: string; categoryId: string }[]): number | null {
  const catFields = fields.filter(f => f.categoryId === catId);
  const catRecords = allRecords.filter((r) =>
    catFields.some((f) => f.id === r.fieldId) &&
    r.recordWeek === weekNum &&
    r.recordYear === year &&
    r.value > 0
  );
  if (catRecords.length === 0) return null;
  const sum = catRecords.reduce((acc: number, r) => acc + r.value, 0);
  return Math.round(sum / catRecords.length * 10) / 10;
}

// 分数颜色：越高越红，越低越绿（1=最佳，4=最差）
function scoreColor(avg: number | null): string {
  if (avg === null) return 'var(--brown-light)';
  if (avg <= 1.5) return '#2E7D52'; // 绿
  if (avg <= 2.5) return '#BA7517'; // 橙
  return '#E24B4A'; // 红
}

// 分数描述
function scoreLabel(avg: number | null): string {
  if (avg === null) return '暂无数据';
  if (avg <= 1.5) return '状态良好';
  if (avg <= 2.5) return '轻微不适';
  return '需要关注';
}

// 环比计算
function calcChange(current: number | null, previous: number | null): { value: number | null; text: string; color: string } {
  if (current === null && previous === null) return { value: null, text: '', color: 'var(--brown-light)' };
  if (current === null) return { value: null, text: '', color: 'var(--brown-light)' };
  if (previous === null) return { value: null, text: '无上周数据', color: 'var(--brown-light)' };
  const diff = current - previous;
  if (Math.abs(diff) < 0.1) return { value: diff, text: '持平', color: '#BA7517' };
  const sign = diff > 0 ? '+' : '';
  return { value: diff, text: `${sign}${diff.toFixed(1)}分`, color: diff > 0 ? '#E24B4A' : '#2E7D52' };
}

export function DataPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [dataTab, setDataTab] = useState<'week' | 'month'>('week');
    const chartInstances = useRef<Chart[]>([]);

  const { categories, fields, records, habits, habitLogs } = useHealthStore();

  const activeNav = location.pathname === '/settings' ? 'settings'
    : location.pathname === '/data' ? 'data'
    : 'home';

  const navTo = (name: 'home' | 'data' | 'settings') => {
    navigate(`/${name === 'home' ? '' : name}`);
  };

  const allRecords = Array.from(records.values());

  // 当前周信息
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentWeekNum = getCurrentWeekNumber();
  
  // 上周信息
  const lastWeekNum = currentWeekNum > 1 ? currentWeekNum - 1 : 52;
  const lastWeekYear = currentWeekNum > 1 ? currentYear : currentYear - 1;
  
  // 本月周数据
  const monthWeeks = useMemo(() => getWeeksOfCurrentMonth(), []);

  // ========== 本周数据 ==========
  // 每个分类本周平均分
  const weekCategoryStats = categories.map(cat => {
    const avg = calcCategoryAvgForWeek(cat.id, currentWeekNum, currentYear, allRecords, fields);
    return { ...cat, avg };
  });

  // 每个分类上周平均分
  const lastWeekCategoryStats = categories.map(cat => {
    const avg = calcCategoryAvgForWeek(cat.id, lastWeekNum, lastWeekYear, allRecords, fields);
    return { ...cat, avg };
  });

  // 本周习惯数据
  const weekHabitStats = habits.map(h => {
    const weekLogs = habitLogs.filter(l => l.habitId === h.id);
    // 获取本周的记录
    const thisWeekLogs = weekLogs.filter(l => {
      // 简化：取最近7天的记录
      const logDate = new Date(l.logDate);
      const daysDiff = Math.floor((now.getTime() - logDate.getTime()) / (24 * 60 * 60 * 1000));
      return daysDiff < 7;
    });
    const completed = thisWeekLogs.filter(l => l.status === 'completed').length;
    const total = thisWeekLogs.length;
    return { ...h, completed, total };
  });

  const weekTotalCompleted = weekHabitStats.reduce((sum, h) => sum + h.completed, 0);
  const weekTotalHabits = habits.length;
  const weekOverallPct = weekTotalHabits > 0 ? Math.round(weekTotalCompleted / (weekTotalHabits * 7) * 100) : 0;

  // ========== 本月数据 ==========
  // 四周折线图数据（按分类）
  const monthCategoryTrends = categories.map(cat => {
    const weekAvgs = monthWeeks.map(weekLabel => {
      // 从 weekLabel 提取 weekNum
      const match = weekLabel.match(/W(\d+)/);
      const wNum = match && match[1] ? parseInt(match[1]) : 1;
      return calcCategoryAvgForWeek(cat.id, wNum, currentYear, allRecords, fields);
    });
    return { ...cat, weekAvgs };
  });

  // 本月习惯达成率
  const monthHabitStats = habits.map(h => {
    const monthLogs = habitLogs.filter(l => {
      const d = new Date(l.logDate);
      return l.habitId === h.id && d.getFullYear() === currentYear && d.getMonth() === now.getMonth();
    });
    const completed = monthLogs.filter(l => l.status === 'completed').length;
    const total = monthWeeks.length; // 本月周数
    const pct = total > 0 ? Math.round(completed / total * 100) : 0;
    return { ...h, completed, total, pct };
  });

  // 渲染折线图
  useEffect(() => {
    if (dataTab !== 'month') return;

    chartInstances.current.forEach(c => c.destroy());
    chartInstances.current = [];

    const container = document.getElementById('month-charts');
    if (!container) return;
    container.innerHTML = '';

    monthCategoryTrends.forEach((cat, catIdx) => {
      const validAvgs = cat.weekAvgs.filter((v): v is number => v !== null);
      if (validAvgs.length === 0) return;

      const card = document.createElement('div');
      card.className = 'chart-card';
      card.innerHTML = `<div class="chart-title">${cat.name}</div>`;

      const canvasWrap = document.createElement('div');
      canvasWrap.style.height = '90px';
      const canvas = document.createElement('canvas');
      const canvasId = `month-chart-${catIdx}`;
      canvas.id = canvasId;
      canvasWrap.appendChild(canvas);
      card.appendChild(canvasWrap);

      const labels = monthWeeks.map(w => {
        const m = w.match(/W\d+\s+(\d+)\/(\d+)/);
        return m ? `${m[1]}/${m[2]}` : w;
      });

      container.appendChild(card);

      const el = document.getElementById(canvasId) as HTMLCanvasElement;
      const color = scoreColor(validAvgs[validAvgs.length - 1] ?? null);
      const ch = new Chart(el, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            data: cat.weekAvgs,
            borderColor: color,
            backgroundColor: color + '18',
            borderWidth: 2,
            pointRadius: 4,
            pointBackgroundColor: color,
            tension: 0.4,
            fill: true,
            spanGaps: true,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: {
              min: 0.5,
              max: 4.5,
              ticks: {
                stepSize: 1,
                callback: (v) => ({ 1: '佳', 2: '轻', 3: '重', 4: '差' }[Number(v)] ?? ''),
                font: { size: 9 },
              },
              grid: { color: 'rgba(200,150,120,.1)' },
            },
            x: { ticks: { font: { size: 9 } }, grid: { display: false } },
          },
        },
      });
      chartInstances.current.push(ch);
    });
  }, [dataTab, monthCategoryTrends, monthWeeks]);

  return (
    <>
      <div className="screen active" id="s-data">
        <div className="hdr-white">
          <div className="title">数据中心</div>
          <div style={{ marginTop: 10 }}>
            <div className="top-tabs">
              <button className={`ttab ${dataTab === 'week' ? 'on' : ''}`} onClick={() => setDataTab('week')}>本周</button>
              <button className={`ttab ${dataTab === 'month' ? 'on' : ''}`} onClick={() => setDataTab('month')}>本月</button>
            </div>
          </div>
        </div>

        <div className="sbody">
          {dataTab === 'week' ? (
            <>
              {/* ========== 本周健康评分 ========== */}
              <div className="sec-label">健康评分</div>
              <div className="stats-grid">
                {weekCategoryStats.map((cat, idx) => {
                  const prevAvg = lastWeekCategoryStats[idx]?.avg ?? null;
                  const change = calcChange(cat.avg, prevAvg);
                  return (
                    <div key={cat.id} className="stat-card">
                      <div className="stat-name">{cat.name}</div>
                      <div className="stat-value" style={{ color: scoreColor(cat.avg) }}>
                        {cat.avg ?? '—'}
                      </div>
                      <div className="stat-label" style={{ color: scoreColor(cat.avg) }}>
                        {scoreLabel(cat.avg)}
                      </div>
                      {change.text && (
                        <div style={{ fontSize: 11, color: change.color, marginTop: 4 }}>
                          环比上周：{change.text}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* ========== 本周习惯达成 ========== */}
              <div className="sec-label">习惯达成</div>
              <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden' }}>
                {/* 汇总 */}
                <div style={{ padding: '12px 14px', borderBottom: '0.5px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 14 }}>总体达成率</span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: weekOverallPct >= 70 ? '#2E7D52' : weekOverallPct >= 40 ? '#BA7517' : '#E24B4A' }}>
                    {weekOverallPct}%
                  </span>
                </div>
                {/* 逐项 */}
                {weekHabitStats.map((h, idx) => (
                  <div key={h.id} style={{
                    padding: '10px 14px',
                    borderBottom: idx < weekHabitStats.length - 1 ? '0.5px solid var(--border)' : 'none',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <span style={{ fontSize: 13 }}>{h.name}</span>
                    <span style={{
                      fontSize: 12,
                      padding: '2px 8px',
                      borderRadius: 10,
                      background: h.completed > 0 ? '#E8F5E9' : '#FFEBEE',
                      color: h.completed > 0 ? '#2E7D52' : '#E24B4A',
                    }}>
                      {h.completed > 0 ? '✓ 已完成' : '○ 未完成'}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              {/* ========== 本月健康评分折线图 ========== */}
              <div className="sec-label">健康评分趋势</div>
              <div id="month-charts"></div>

              {/* ========== 本月习惯达成率 ========== */}
              <div className="sec-label">习惯达成率</div>
              <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden' }}>
                {monthHabitStats.map((h, idx) => (
                  <div key={h.id} style={{
                    padding: '12px 14px',
                    borderBottom: idx < monthHabitStats.length - 1 ? '0.5px solid var(--border)' : 'none',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 13 }}>{h.name}</span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: h.pct >= 70 ? '#2E7D52' : h.pct >= 40 ? '#BA7517' : '#E24B4A' }}>
                        {h.pct}%
                      </span>
                    </div>
                    <div style={{ height: 6, background: '#F0E5DA', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${h.pct}%`,
                        background: h.pct >= 70 ? '#2E7D52' : h.pct >= 40 ? '#BA7517' : '#E24B4A',
                        borderRadius: 3,
                        transition: 'width 0.3s',
                      }} />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--brown-light)', marginTop: 4 }}>
                      {h.completed}次 / {h.total}周
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

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
    </>
  );
}
