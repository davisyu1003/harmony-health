// ============================================================
// 数据中心页
// ============================================================

import { useEffect, useRef, useState } from 'react';
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

export function DataPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [dataTab, setDataTab] = useState<'week' | 'month' | 'year'>('week');

  const bmiChartRef = useRef<HTMLCanvasElement | null>(null);
  const bmiChartInstance = useRef<Chart | null>(null);
  const healthChartInstances = useRef<Chart[]>([]);

  const { categories, fields, records, weeklyMeta, weeks, habits, habitLogs } = useHealthStore();

  // Determine active nav from URL
  const activeNav = location.pathname === '/settings' ? 'settings' 
    : location.pathname === '/data' ? 'data' 
    : 'home';

  const navTo = (name: 'home' | 'data' | 'settings') => {
    navigate(`/${name === 'home' ? '' : name}`);
  };

  // 获取所有周的数据
  const allRecords = Array.from(records.values());

  // 根据时间范围过滤数据
  const getFilteredRecords = () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentWeek = Math.ceil((now.getDate() + new Date(currentYear, now.getMonth(), 1).getDay()) / 7);

    if (dataTab === 'week') {
      // 本周数据
      return allRecords.filter(r => r.recordYear === currentYear && r.recordWeek === currentWeek);
    } else if (dataTab === 'month') {
      // 本月数据
      return allRecords.filter(r => {
        const d = new Date(r.recordDate);
        return d.getFullYear() === currentYear && d.getMonth() + 1 === currentMonth;
      });
    } else {
      // 本年数据
      return allRecords.filter(r => r.recordYear === currentYear);
    }
  };

  const filteredRecords = getFilteredRecords();

  // 计算每个分类的平均分
  const categoryStats = categories.map(cat => {
    const catFields = fields.filter(f => f.categoryId === cat.id);
    const catRecords = filteredRecords.filter(r => catFields.some(f => f.id === r.fieldId) && r.value > 0);
    if (catRecords.length === 0) return { ...cat, avg: null, count: 0 };
    const sum = catRecords.reduce((acc, r) => acc + r.value, 0);
    const avg = Math.round(sum / catRecords.length * 10) / 10;
    return { ...cat, avg, count: catRecords.length };
  });

  // 计算习惯完成率
  const habitStats = habits.map(h => {
    let totalDays = 7; // 本周默认7天
    
    if (dataTab === 'month') {
      totalDays = 30;
    } else if (dataTab === 'year') {
      totalDays = 365;
    }
    
    const completedLogs = habitLogs.filter(l => 
      l.habitId === h.id && l.status === 'completed'
    ).length;
    
    const pct = Math.min(100, Math.round(completedLogs / totalDays * 100));
    return { ...h, pct, completed: completedLogs, total: totalDays };
  });

  // 渲染 BMI 趋势图
  useEffect(() => {
    if (!bmiChartRef.current) return;

    if (bmiChartInstance.current) {
      bmiChartInstance.current.destroy();
    }

    const labels = weeks.map((w) => w.split(' ')[0]);
    const data = weeks.map((_, i) => {
      // 从 weekLabel 提取 weekKey
      const weekMeta = weeklyMeta.get(`2026-W${((4 - i) + 1).toString().padStart(2, '0')}`);
      if (!weekMeta || !weekMeta.weight || !weekMeta.height) return null;
      const w = parseFloat(weekMeta.weight.toString());
      const h = parseFloat(weekMeta.height.toString());
      if (w && h && h > 50) return +(w / Math.pow(h / 100, 2)).toFixed(1);
      return null;
    });

    bmiChartInstance.current = new Chart(bmiChartRef.current, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data,
          borderColor: '#C8694A',
          backgroundColor: 'rgba(200,105,74,0.1)',
          borderWidth: 2,
          pointRadius: 4,
          pointBackgroundColor: '#C8694A',
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
          y: { min: 15, max: 35, ticks: { stepSize: 5, font: { size: 10 } }, grid: { color: 'rgba(200,150,120,.12)' } },
          x: { ticks: { font: { size: 9 } }, grid: { display: false } },
        },
      },
    });

    return () => {
      bmiChartInstance.current?.destroy();
    };
  }, [weeklyMeta, weeks]);

  // 渲染健康趋势图
  useEffect(() => {
    healthChartInstances.current.forEach((c) => c.destroy());
    healthChartInstances.current = [];

    // 渲染每个分类的趋势图
    const container = document.getElementById('health-charts-data');
    if (!container) return;
    container.innerHTML = '';

    const labels = weeks.map((w) => w.split(' ')[0]);

    categories.forEach((cat) => {
      const catFields = fields.filter((f) => f.categoryId === cat.id);
      if (catFields.length === 0) return;

      const div = document.createElement('div');
      div.className = 'chart-card';

      // 只渲染前两个字段
      const fieldCharts = catFields.slice(0, 2).map((f) => {
        const vals = weeks.map((_, i) => {
          const recs = allRecords.filter((r) => r.fieldId === f.id && !r.deletedAt);
          const rec = recs.find((r) => {
            return r.recordWeek === (5 - i) && r.recordYear === 2026;
          });
          return rec?.value ?? null;
        });

        const validVals = vals.filter((v): v is number => v !== null);
        const improving = validVals.length >= 2 &&
          (validVals[validVals.length - 1] ?? 0) <= (validVals[0] ?? 0);
        const color = improving ? '#2E7D52' : '#E24B4A';

        const chartDiv = document.createElement('div');
        chartDiv.style.fontSize = '11px';
        chartDiv.style.color = 'var(--brown-mid)';
        chartDiv.style.margin = '6px 0 3px';
        chartDiv.textContent = f.name;

        const canvasWrap = document.createElement('div');
        canvasWrap.style.height = '75px';
        const canvas = document.createElement('canvas');
        canvas.id = `hc-${f.id}`;
        canvasWrap.appendChild(canvas);
        return { f, vals, color, chartDiv, canvasWrap };
      });

      div.innerHTML = `
        <div class="chart-title">${cat.name}</div>
        <div class="chart-sub">1=完全恢复 → 4=问题严重</div>
      `;
      fieldCharts.forEach(({ chartDiv, canvasWrap }) => {
        div.appendChild(chartDiv);
        div.appendChild(canvasWrap);
      });
      div.innerHTML += `
        <div class="chart-legend">
          <div class="leg"><div class="leg-dot" style="background:#2E7D52;"></div>逐步向好</div>
          <div class="leg"><div class="leg-dot" style="background:#E24B4A;"></div>逐步变差</div>
        </div>
      `;

      container.appendChild(div);

      // 创建 Chart
      fieldCharts.forEach(({ f, vals, color }) => {
        const el = document.getElementById(`hc-${f.id}`) as unknown as HTMLCanvasElement;
        if (!el) return;
        const ch = new Chart(el, {
          type: 'line',
          data: {
            labels,
            datasets: [{
              data: vals,
              borderColor: color,
              backgroundColor: color + '18',
              borderWidth: 2,
              pointRadius: 3,
              pointBackgroundColor: color,
              tension: 0.4,
              fill: true,
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
        healthChartInstances.current.push(ch);
      });
    });

    return () => {
      healthChartInstances.current.forEach((c) => c.destroy());
    };
  }, [records, categories, fields, weeks]);

  // 习惯达成率（使用新的 habitStats）
  const habitRings = habitStats.map((h) => {
    const pct = h.pct;
    const color = pct >= 70 ? '#2E7D52' : pct >= 40 ? '#BA7517' : '#E24B4A';
    const circ = 2 * Math.PI * 22;
    const filled = (circ * pct / 100).toFixed(1);
    const empty = (parseFloat(filled) ? circ - parseFloat(filled) : circ).toFixed(1);
    const label = h.name.length > 6 ? h.name.slice(0, 6) + '…' : h.name;
    return { h, pct, filled, empty, color, label };
  });

  return (
    <>
      <div className="screen active" id="s-data">
        <div className="hdr-white">
          <div className="title">数据中心</div>
          <div style={{ marginTop: 10 }}>
            <div className="top-tabs">
              <button className={`ttab ${dataTab === 'week' ? 'on' : ''}`} onClick={() => setDataTab('week')}>
                本周
              </button>
              <button className={`ttab ${dataTab === 'month' ? 'on' : ''}`} onClick={() => setDataTab('month')}>
                本月
              </button>
              <button className={`ttab ${dataTab === 'year' ? 'on' : ''}`} onClick={() => setDataTab('year')}>
                本年
              </button>
            </div>
          </div>
        </div>

        <div className="sbody">
          {/* 健康评分统计 */}
          <div className="sec-label">健康评分平均</div>
          <div className="stats-grid">
            {categoryStats.map((cat) => (
              <div key={cat.id} className="stat-card">
                <div className="stat-name">{cat.name}</div>
                <div className="stat-value" style={{ 
                  color: cat.avg && cat.avg <= 1.5 ? '#2E7D52' 
                    : cat.avg && cat.avg <= 2.5 ? '#BA7517' 
                    : cat.avg ? '#E24B4A' : 'var(--brown-light)' 
                }}>
                  {cat.avg ?? '—'}
                </div>
                <div className="stat-label">
                  {cat.avg === 1 ? '状态极佳' 
                    : cat.avg === 2 ? '轻微不适' 
                    : cat.avg === 3 ? '不适加重' 
                    : cat.avg === 4 ? '问题严重'
                    : cat.avg && cat.avg < 2 ? '状态良好'
                    : cat.avg && cat.avg < 3 ? '需要关注'
                    : cat.avg ? '需要改善'
                    : '暂无数据'}
                </div>
              </div>
            ))}
          </div>

          {/* 习惯完成率 */}
          <div className="sec-label">习惯达成率</div>
          <div className="habits-grid">
            {habitRings.map(({ h, pct, filled, empty, color, label }) => (
              <div key={h.id} className="habit-ring">
                <svg viewBox="0 0 50 50">
                  <circle cx="25" cy="25" r="22" fill="none" stroke="#E8E8E8" strokeWidth="4" />
                  <circle 
                    cx="25" cy="25" r="22" 
                    fill="none" 
                    stroke={color} 
                    strokeWidth="4" 
                    strokeLinecap="round"
                    strokeDasharray={`${filled} ${empty}`}
                    transform="rotate(-90 25 25)"
                  />
                </svg>
                <div className="habit-pct" style={{ color }}>{pct}%</div>
                <div className="habit-name">{label}</div>
              </div>
            ))}
          </div>

          {/* 习惯达成率 */}
          <div className="sec-label">习惯达成率</div>
          <div className="chart-card">
            <div className="chart-title">本月养生计划完成情况</div>
            <div className="chart-sub">完成次数 / 本月总周次</div>
            <div className="rings-row">
              {habitRings.map(({ h, pct, filled, empty, color, label }) => (
                <div className="ring-item" key={h.id}>
                  <svg width="64" height="64" viewBox="0 0 64 64">
                    <circle cx="32" cy="32" r="22" fill="none" stroke="#F0E5DA" strokeWidth="7" />
                    <circle
                      cx="32" cy="32" r="22"
                      fill="none"
                      stroke={color}
                      strokeWidth="7"
                      strokeDasharray={`${filled} ${empty}`}
                      strokeLinecap="round"
                      transform="rotate(-90 32 32)"
                    />
                    <text x="32" y="37" textAnchor="middle" fontSize="13" fontWeight="600" fill={color}>
                      {pct}%
                    </text>
                  </svg>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
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
