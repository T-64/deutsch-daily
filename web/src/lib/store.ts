import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/* ---------- preferences ---------- */
export type Theme = 'system' | 'light' | 'dark';
export type ZhMode = 'hidden' | 'current' | 'all';
export type PlayMode = 'flow' | 'stop' | 'loop';

interface Prefs {
  theme: Theme;
  scale: number; // index into SCALES
  zh: ZhMode;
  mode: PlayMode;
  rate: number;
  audioOnly: boolean;
  follow: boolean;
  set: (p: Partial<Omit<Prefs, 'set'>>) => void;
}
export const SCALES = [0.88, 0.94, 1, 1.08, 1.18];

const safeStorage = createJSONStorage(() => {
  try {
    const k = '__dd_probe';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    const mem = new Map<string, string>();
    return { getItem: k => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: k => void mem.delete(k) };
  }
});

export const usePrefs = create<Prefs>()(
  persist(
    set => ({ theme: 'system', scale: 2, zh: 'current', mode: 'flow', rate: 1, audioOnly: false, follow: true, set: p => set(p) }),
    { name: 'dd-prefs-v3', storage: safeStorage, partialize: ({ set: _s, ...rest }) => rest },
  ),
);

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
}

/* ---------- notebook (shares the `dd-basket` key and item shape with the first front end) ---------- */
export interface Word {
  key: string;
  word: string;
  zh: string;
  pos: string;
  example: string;
  exampleZh: string;
  date: string;
  topic: string;
  source: string;
  createdAt: number;
  manual: boolean;
}
const BASKET = 'dd-basket';
const GLOSS = 'dd-user-gloss';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode: keep in memory */ }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalize(b: any): Word {
  return {
    key: String(b.key), word: String(b.word), zh: String(b.zh ?? ''), pos: String(b.pos ?? ''),
    example: String(b.example ?? b.exampleDe ?? ''), exampleZh: String(b.exampleZh ?? ''),
    date: String(b.date ?? ''), topic: String(b.topic ?? ''), source: String(b.source ?? ''),
    createdAt: Number(b.createdAt) || 0, manual: Boolean(b.manual),
  };
}

interface Notebook {
  words: Word[];
  userGloss: Record<string, { word: string; zh: string; pos: string; example: string }>;
  upsert: (w: Partial<Word> & { key: string; word: string; zh: string }) => void;
  remove: (key: string) => void;
  reorder: (keys: string[]) => void;
  setGloss: (key: string, g: { word: string; zh: string; pos: string; example: string }) => void;
}

const initialWords = (() => {
  const raw = read<unknown>(BASKET, []);
  return Array.isArray(raw) ? raw.filter(b => b && (b as Word).key && (b as Word).word).map(b => normalize(b as Word)) : [];
})();

export const useNotebook = create<Notebook>()((set, get) => ({
  words: initialWords,
  userGloss: read(GLOSS, {}),
  upsert: w => {
    const words = [...get().words];
    const i = words.findIndex(x => x.key === w.key);
    if (i >= 0) words[i] = normalize({ ...words[i], ...w });
    else words.unshift(normalize({ createdAt: Date.now(), ...w }));
    set({ words });
    write(BASKET, words);
  },
  remove: key => {
    const words = get().words.filter(w => w.key !== key);
    set({ words });
    write(BASKET, words);
  },
  reorder: keys => {
    const byKey = new Map(get().words.map(w => [w.key, w]));
    const words = keys.map(k => byKey.get(k)!).filter(Boolean);
    set({ words });
    write(BASKET, words);
  },
  setGloss: (key, g) => {
    const userGloss = { ...get().userGloss, [key]: g };
    set({ userGloss });
    write(GLOSS, userGloss);
  },
}));

/* other tabs keep the notebook in sync */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => {
    if (e.key === BASKET) useNotebook.setState({ words: read<Word[]>(BASKET, []).map(normalize) });
    if (e.key === GLOSS) useNotebook.setState({ userGloss: read(GLOSS, {}) });
  });
}

export const recent = {
  get: () => read<{ slug: string; date: string; title: string; t?: number } | null>('dd-recent-lesson', null),
  set: (v: { slug: string; date: string; title: string; t?: number }) => write('dd-recent-lesson', v),
};
