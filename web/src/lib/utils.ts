import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function clock(sec: number | null | undefined) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function parse(iso: string) {
  return new Date(iso + 'T12:00:00');
}
export function deDate(iso: string) {
  const d = parse(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function de(iso: string, opts: Intl.DateTimeFormatOptions) {
  const d = parse(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('de-DE', opts);
}
export function minutes(sec: number) {
  return `${Math.max(1, Math.round(sec / 60))} min`;
}
