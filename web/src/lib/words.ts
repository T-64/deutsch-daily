import type { Lesson, Gloss } from './data';

export interface Token { text: string; key?: string }

const LETTER = /[A-Za-zÄÖÜäöüß]/;
const WORD_CHAR = /[A-Za-zÄÖÜäöüß-]/;

export function makeTokenizer(lesson: Lesson) {
  const phrases = [...(lesson.phrases || [])].sort((a, b) => b.length - a.length).map(p => [p, p.toLowerCase()] as const);
  const lookupKey = (surface: string) => lesson.form_to_key[surface.toLowerCase()] || surface.toLowerCase();
  const cache = new Map<string, Token[]>();
  return (text: string): Token[] => {
    const hit = cache.get(text);
    if (hit) return hit;
    const out: Token[] = [];
    const lower = text.toLowerCase();
    let i = 0;
    while (i < text.length) {
      if (i === 0 || !LETTER.test(text[i - 1])) {
        const ph = phrases.find(([, low]) => lower.startsWith(low, i) && !LETTER.test(text[i + low.length] || ''));
        if (ph) {
          const s = text.slice(i, i + ph[0].length);
          out.push({ text: s, key: lookupKey(s) });
          i += ph[0].length;
          continue;
        }
      }
      let j = i + 1;
      if (LETTER.test(text[i])) {
        while (j < text.length && WORD_CHAR.test(text[j])) j++;
        const s = text.slice(i, j);
        out.push({ text: s, key: lookupKey(s) });
      } else {
        while (j < text.length && !LETTER.test(text[j])) j++;
        out.push({ text: text.slice(i, j) });
      }
      i = j;
    }
    cache.set(text, out);
    return out;
  };
}

export function glossFor(lesson: Lesson, userGloss: Record<string, { word: string; zh: string; pos: string; example: string }>, key: string): Gloss | null {
  const u = userGloss[key];
  if (u) return { ...u, source: 'user' };
  return lesson.gloss[key] || null;
}
