import type { Page } from '@/lib/data';
// Dev-server placeholder only (`npm run dev` without build.py). Production pages always carry #dd-data.
export function sample(): Page {
  return { page: 'home', items: [] };
}
