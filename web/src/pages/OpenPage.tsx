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
    document.title = 'Link — Deutsch Daily';
    const on = () => { const v = fromHash(); if (v) open(v); };
    on();
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const issue = (url: string) => 'https://github.com/T-64/deutsch-daily/issues/new?title=' + encodeURIComponent('Source request') + '&body=' + encodeURIComponent(url);

  return (
    <>
      <TopBar><Logo /><div className="ml-auto"><SettingsMenu /></div></TopBar>
      <main className="mx-auto max-w-2xl px-4 pb-32 pt-20 sm:px-6">
        <h1 className="font-serif text-[clamp(56px,8vw,112px)] leading-[0.88] tracking-[-0.03em] text-fg">Link <span className="italic text-fg-2">öffnen</span></h1>
        <form
          className="mt-14 flex gap-2 rounded-full border border-line-2 bg-surface/70 p-1.5 shadow-[var(--shadow)] focus-within:border-accent focus-within:ring-4 focus-within:ring-accent-soft"
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
            aria-label="Link"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-faint"
          />
          <Button type="submit" variant="accent" size="icon" aria-label="Öffnen"><ArrowRight /></Button>
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
                  <h2 className="text-lg font-medium text-fg">
                    {result.kind === 'invalid' ? 'Ungültiger Link' : 'Nicht im Archiv'}
                  </h2>
                  {result.kind !== 'invalid' && <p className="mt-3 truncate rounded-lg bg-bg-2 px-3 py-2 font-mono text-xs text-muted">{result.url}</p>}
                </div>
              </div>
              {result.kind === 'youtube' && (
                <div className="mt-5 aspect-video overflow-hidden rounded-2xl bg-black">
                  <iframe className="size-full" src={`https://www.youtube.com/embed/${encodeURIComponent(result.id)}`} title="YouTube" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                </div>
              )}
              <div className="mt-6 flex flex-wrap gap-2">
                <Button asChild variant="default"><a href={result.kind === 'invalid' ? 'studio.html' : `studio.html#source=${encodeURIComponent(result.url)}`}>Studio</a></Button>
                {result.kind !== 'invalid' && (
                  <>
                    <Button asChild variant="outline"><a href={result.url} target="_blank" rel="noreferrer">Original <ExternalLink /></a></Button>
                    <Button asChild variant="ghost"><a href={issue(result.url)} target="_blank" rel="noreferrer" aria-label="Anfrage"><Send /></a></Button>
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
