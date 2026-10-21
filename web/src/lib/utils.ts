import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function clock(sec: number | null | undefined) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const WEEK_SHORT = '日一二三四五六';

function parse(iso: string) {
  return new Date(iso + 'T12:00:00');
}
export function zhDate(iso: string, opts: { year?: boolean; weekday?: boolean } = {}) {
  const d = parse(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const { year = false, weekday = true } = opts;
  return `${year ? d.getFullYear() + ' 年 ' : ''}${d.getMonth() + 1} 月 ${d.getDate()} 日${weekday ? ' · ' + WEEK[d.getDay()] : ''}`;
}
export function zhWeekShort(iso: string) {
  return '周' + WEEK_SHORT[parse(iso).getDay()];
}
export function deDate(iso: string) {
  const d = parse(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
