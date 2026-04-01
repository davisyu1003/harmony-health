// ============================================================
// 日期工具函数
// ============================================================

/**
 * 获取 ISO 周键，格式: '2026-W13'
 */
export function getWeekKey(date: Date = new Date()): string {
  const year = getISOYear(date);
  const week = getISOWeek(date);
  return `${year}-W${week.toString().padStart(2, '0')}`;
}

/**
 * 获取 ISO 年份（周所在年，跨年周归入正确的年份）
 */
export function getISOYear(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  return d.getUTCFullYear();
}

/**
 * 获取 ISO 周数（1-53）
 */
export function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * 格式化日期为 YYYY-MM-DD
 */
export function formatDate(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 获取某年某周的范围（周一到周日）
 */
export function getWeekRange(year: number, week: number): { start: Date; end: Date } {
  const simple = new Date(year, 0, 1 + (week - 1) * 7);
  const dow = simple.getDay();
  const ISOWeekStart = simple.getDate() - (dow <= 4 ? dow - 1 : dow - 8);
  const start = new Date(year, 0, ISOWeekStart);
  const end = new Date(year, 0, ISOWeekStart + 6);
  return { start, end };
}

/**
 * 从 weekLabel ('W1 04/01-04/07') 提取真正的 weekKey
 */
export function weekLabelToKey(label: string): string {
  const parts = label.split(' ');
  if (!parts[1]) return getWeekKey();
  const range = parts[1].split('-');
  const startStr = range[0] ?? '01/01';
  const [month, day] = startStr.split('/').map(Number);
  const year = new Date().getFullYear();
  const d = new Date(year, (month ?? 1) - 1, day ?? 1);
  return getWeekKey(d);
}

/**
 * 获取本周的日期范围
 */
export function getCurrentWeekRange(weekLabel: string): { start: Date; end: Date } {
  const parts = weekLabel.split(' ')[1]?.split('-') ?? ['01/01', '01/07'];
  const startStr = parts[0] ?? '01/01';
  const endStr = parts[1] ?? '01/07';
  const [sm, sd] = (startStr).split('/').map(Number);
  const [em, ed] = (endStr).split('/').map(Number);
  const year = new Date().getFullYear();
  return {
    start: new Date(year, (sm ?? 1) - 1, sd ?? 1),
    end: new Date(year, (em ?? 1) - 1, ed ?? 1),
  };
}
