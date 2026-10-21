/* Page payloads written by build.py into <script id="dd-data" type="application/json">. */

export interface Gloss { word: string; zh: string; pos: string; example?: string; source: 'editorial' | 'dict' | 'user' }

export interface Sentence { de: string; zh: string; start: number | null; end: number | null }

export interface Vocab { key: string; lemma: string; pos: string; zh: string; example_de: string; example_zh: string }
export interface Grammar { title: string; summary: string; example_de: string; example_zh: string }

export interface Story {
  title: string;
  title_zh: string;
  from: number; // inclusive sentence range into Lesson.sentences
  to: number;
  vocab: Vocab[];
  grammar: Grammar[];
  background: string;
}

export interface Lesson {
  slug: string;
  date: string;
  show: string;
  level: string;
  kind: 'broadcast' | 'video' | 'reading';
  note: string;
  source_url: string;
  video: { mp4: string; embed: string; page: string };
  duration: number | null;
  sentences: Sentence[];
  stories: Story[];
  gloss: Record<string, Gloss>;
  form_to_key: Record<string, string>;
  phrases: string[];
}

export interface CatalogItem {
  slug: string;
  date: string;
  kind: Lesson['kind'];
  count: number;
  duration: number | null;
  titles: string[];
  titles_zh: string[];
  mp4: string;
  urls: string[];
}

export type Page =
  | { page: 'home'; items: CatalogItem[] }
  | { page: 'lesson'; lesson: Lesson; items: CatalogItem[] }
  | { page: 'about' }
  | { page: 'open'; items: CatalogItem[] };

export function readPage(): Page {
  const el = document.getElementById('dd-data');
  if (el?.textContent) return JSON.parse(el.textContent) as Page;
  return { page: 'home', items: [] };
}
