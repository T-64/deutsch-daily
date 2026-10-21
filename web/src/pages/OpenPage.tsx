import { AlertCircle, ArrowRight, ExternalLink, FileVideo, Link2, Send } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Footer, Logo, SettingsMenu, TopBar } from '@/components/shell';
import { Button } from '@/components/ui/button';
import type { CatalogItem } from '@/lib/data';

type Result =
  | { kind: 'invalid'; url: string }
  | { kind: 'youtube'; url: string; id: string }
  | { kind: 'unsupported'; url: string };

function normalized(raw: string) {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocol');
  url.hash = '';
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
  return url.href;
}
function youtubeId(raw: string) {
  try {
    const url = new URL(raw);
    if (url.hostname === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] || '';
    if (/(^|\.)youtube\.com$/.test(url.hostname)) {
      if (url.pathname === '/watch') return url.searchParams.get('v') || '';
      return url.pathname.match(/^\/(?:shorts|embed)\/([^/?]+)/)?.[1] || '';
    }
  } catch { /* not a URL */ }
  return '';
}
function fromHash() {
  const h = location.hash.slice(1);
  if (!h) return '';
  try { return decodeURIComponent(h); } catch { return h; }
}

export function OpenPage({ items }: { items: CatalogItem[] }) {
  const [value, setValue] = useState('');
  const [result, setResult] = useState<Result | null>(null);

  function open(raw: string) {
    let url: string;
    try { url = normalized(raw.trim()); } catch { setResult({ kind: 'invalid', url: raw || '—' }); return; }
    setValue(url);
    const match = items.find(it => it.urls.some(c => { try { return normalized(c) === url; } catch { return false; } }));
    if (match) { location.replace(`${match.slug}.html`); return; }
    const id = youtubeId(url);
    setResult(id ? { kind: 'youtube', url, id } : { kind: 'unsupported', url });
  }
  useEffect(() => {
    document.title = '用链接打开 — Deutsch Daily';
    const on = () => { const v = fromHash(); if (v) open(v); };
    on();
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const issue = (url: string) => 'https://github.com/T-64/deutsch-daily/issues/new?title=' + encodeURIComponent('希望支持这个视频来源') + '&body=' + encodeURIComponent('视频链接：' + url);

  return (
    <>
      <TopBar><Logo /><div className="ml-auto"><SettingsMenu /></div></TopBar>
      <main className="mx-auto max-w-2xl px-4 pb-28 pt-20 sm:px-6">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Link öffnen</p>
        <h1 className="mt-3 text-[clamp(34px,5vw,56px)] font-semibold leading-[1.05] tracking-[-0.035em] text-fg">粘贴一个视频链接</h1>
        <p className="mt-4 text-pretty text-[17px] leading-relaxed text-fg-2">已收录的 tagesschau 节目会直接打开课程。其他来源可以用你自己有权处理的字幕，在浏览器本地做成课程。</p>
        <form
          className="mt-10 flex gap-2 rounded-full border border-line-2 bg-surface/70 p-1.5 shadow-[var(--shadow)] focus-within:border-accent focus-within:ring-4 focus-within:ring-accent-soft"
          onSubmit={e => {
            e.preventDefault();
            const next = encodeURIComponent(value.trim());
            if (location.hash.slice(1) === next) open(value);
            else location.hash = next;
          }}
        >
          <Link2 className="ml-3 size-5 self-center text-faint" />
          <input
            value={value}
            onChange={e => setValue(e.target.value)}
            type="url"
            inputMode="url"
            required
            placeholder="https://www.tagesschau.de/…"
            aria-label="视频链接"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-faint"
          />
          <Button type="submit" variant="accent">打开 <ArrowRight /></Button>
        </form>

        <AnimatePresence mode="wait">
          {result && (
            <motion.section
              key={result.url + result.kind}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mt-8 rounded-[24px] border border-line-2 bg-surface/60 p-6"
            >
              <div className="flex items-start gap-3">
                {result.kind === 'invalid' ? <AlertCircle className="mt-0.5 size-5 text-danger" /> : <FileVideo className="mt-0.5 size-5 text-accent" />}
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-fg">
                    {result.kind === 'invalid' ? '这个链接格式不对' : result.kind === 'youtube' ? '可以播放；有自己的字幕就能做成课程' : '这个来源还没有自动接入'}
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted">
                    {result.kind === 'invalid'
                      ? '请使用以 http:// 或 https:// 开头的完整链接，或者直接上传自己的字幕。'
                      : '公开版不会抓取受限的视频或字幕。如果你有权使用媒体和字幕，可以在浏览器本地创建逐句课程；也可以提交来源请求。'}
                  </p>
                  {result.kind !== 'invalid' && <p className="mt-3 truncate rounded-lg bg-bg-2 px-3 py-2 font-mono text-xs text-muted">{result.url}</p>}
                </div>
              </div>
              {result.kind === 'youtube' && (
                <div className="mt-5 aspect-video overflow-hidden rounded-2xl bg-black">
                  <iframe className="size-full" src={`https://www.youtube.com/embed/${encodeURIComponent(result.id)}`} title="YouTube 视频播放器" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                </div>
              )}
              <div className="mt-6 flex flex-wrap gap-2">
                <Button asChild variant="default"><a href={result.kind === 'invalid' ? 'studio.html' : `studio.html#source=${encodeURIComponent(result.url)}`}>用自己的字幕创建课程</a></Button>
                {result.kind !== 'invalid' && (
                  <>
                    <Button asChild variant="outline"><a href={result.url} target="_blank" rel="noreferrer">打开原视频 <ExternalLink /></a></Button>
                    <Button asChild variant="ghost"><a href={issue(result.url)} target="_blank" rel="noreferrer"><Send />提交支持请求</a></Button>
                  </>
                )}
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </main>
      <Footer />
    </>
  );
}
