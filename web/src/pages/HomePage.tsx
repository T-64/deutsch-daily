import { ArrowRight, ArrowUpRight, BookMarked, Headphones, MousePointerClick, Search, Repeat1 } from 'lucide-react';
import { motion, useScroll, useTransform } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Footer, Logo, SettingsMenu, TopBar } from '@/components/shell';
import { Button } from '@/components/ui/button';
import type { CatalogItem } from '@/lib/data';
import { recent } from '@/lib/store';
import { cn, deDate, zhDate, zhWeekShort } from '@/lib/utils';

const ease = [0.16, 1, 0.3, 1] as const;

function HeroVideo({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const v = ref.current;
    if (!v || matchMedia('(prefers-reduced-motion: reduce)').matches || matchMedia('(max-width: 767px)').matches) return;
    v.src = src + '#t=48';
    const start = () => { v.currentTime = 48; v.play().then(() => setOn(true)).catch(() => {}); };
    v.addEventListener('loadedmetadata', start, { once: true });
    const loop = () => { if (v.currentTime > 70) v.currentTime = 48; };
    v.addEventListener('timeupdate', loop);
    return () => v.removeEventListener('timeupdate', loop);
  }, [src]);
  return (
    <video
      ref={ref}
      muted
      playsInline
      preload="none"
      aria-hidden
      className={cn('absolute inset-0 h-full w-full scale-105 object-cover transition-opacity duration-[2000ms]', on ? 'opacity-45 dark:opacity-40' : 'opacity-0')}
    />
  );
}

function Hero({ latest, total }: { latest?: CatalogItem; total: { lessons: number; minutes: number } }) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const fade = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const last = recent.get();
  const resume = last && last.slug !== latest?.slug ? last : null;

  return (
    <section ref={ref} className="relative isolate -mt-14 overflow-hidden pt-14 grain">
      {latest?.mp4 && <HeroVideo src={latest.mp4} />}
      <div className="absolute inset-0 -z-0 bg-[radial-gradient(120%_80%_at_70%_0%,transparent_0%,var(--bg)_70%)]" />
      <div className="absolute inset-x-0 bottom-0 -z-0 h-48 bg-gradient-to-b from-transparent to-[var(--bg)]" />

      <motion.div style={{ y, opacity: fade }} className="relative mx-auto grid max-w-[1480px] gap-14 px-4 pb-20 pt-[clamp(56px,11vh,140px)] sm:px-6 lg:grid-cols-[1.25fr_1fr] lg:gap-20 lg:px-8 lg:pb-28">
        <div>
          <motion.p
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease }}
            className="inline-flex items-center gap-2 rounded-full border border-line-2 bg-surface/40 px-3 py-1 text-xs font-medium text-fg-2 backdrop-blur"
          >
            <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" /><span className="relative inline-flex size-2 rounded-full bg-accent" /></span>
            每天更新 · tagesschau in Einfacher Sprache
          </motion.p>
          <h1 className="mt-7 text-[clamp(44px,7.4vw,112px)] font-semibold leading-[0.98] tracking-[-0.045em] text-fg">
            <motion.span className="block" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, ease, delay: 0.05 }}>
              听懂德国新闻，
            </motion.span>
            <motion.span
              lang="de"
              className="block font-serif font-normal italic tracking-[-0.03em] text-accent"
              initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, ease, delay: 0.16 }}
            >
              Satz für Satz.
            </motion.span>
          </h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease, delay: 0.3 }}
            className="mt-7 max-w-[34rem] text-pretty text-[17px] leading-relaxed text-fg-2 sm:text-lg"
          >
            每天一期 tagesschau 简易德语新闻。原声视频配官方字幕，逐句跟读、单句循环、点词即查，生词一键导出 Anki。
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease, delay: 0.4 }} className="mt-9 flex flex-wrap items-center gap-3">
            {latest && (
              <Button asChild variant="accent" size="lg">
                <a href={`${latest.slug}.html`}>开始今天的跟练 <ArrowRight /></a>
              </Button>
            )}
            {resume && (
              <Button asChild variant="ghost" size="lg">
                <a href={`${resume.slug}.html`} className="max-w-[18rem]"><span className="truncate">继续 {zhDate(resume.date, { weekday: false })}</span></a>
              </Button>
            )}
          </motion.div>
          <motion.dl initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 0.6 }} className="mt-14 flex gap-10 text-sm">
            <div><dt className="text-muted">已收录</dt><dd className="mt-1 text-2xl font-semibold tabular tracking-tight text-fg">{total.lessons}<span className="ml-1 text-sm font-normal text-muted">期</span></dd></div>
            <div><dt className="text-muted">原声</dt><dd className="mt-1 text-2xl font-semibold tabular tracking-tight text-fg">{Math.round(total.minutes / 60 * 10) / 10}<span className="ml-1 text-sm font-normal text-muted">小时</span></dd></div>
            <div><dt className="text-muted">难度</dt><dd className="mt-1 text-2xl font-semibold tracking-tight text-fg">A2–B1</dd></div>
          </motion.dl>
        </div>

        {latest && (
          <motion.a
            href={`${latest.slug}.html`}
            initial={{ opacity: 0, y: 30, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 1.1, ease, delay: 0.25 }}
            className="group relative self-end overflow-hidden rounded-[28px] border border-line-2 bg-surface/55 p-7 shadow-[var(--shadow)] backdrop-blur-2xl transition-colors hover:bg-surface/70 sm:p-8"
          >
            <div className="flex items-baseline justify-between gap-4">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">最新一期</p>
              <ArrowUpRight className="size-5 text-muted transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-fg" />
            </div>
            <p className="mt-5 text-[34px] font-semibold leading-none tracking-[-0.03em] text-fg">{zhDate(latest.date)}</p>
            <p lang="de" className="mt-2 font-serif text-[17px] italic text-muted">{deDate(latest.date)}</p>
            <ol className="mt-7 space-y-4">
              {latest.titles.slice(0, 5).map((t, i) => (
                <li key={i} className="grid grid-cols-[26px_1fr] gap-2">
                  <span className="pt-1 font-mono text-[11px] tabular text-accent">{String(i + 1).padStart(2, '0')}</span>
                  <span>
                    <span lang="de" className="block text-[16px] font-medium leading-snug text-fg">{t}</span>
                    {latest.titles_zh[i] && <span className="block text-[13px] text-muted">{latest.titles_zh[i]}</span>}
                  </span>
                </li>
              ))}
            </ol>
            {latest.duration && <p className="mt-7 border-t border-line pt-4 text-xs text-muted">{latest.count} 段 · {Math.round(latest.duration / 60)} 分钟原声</p>}
          </motion.a>
        )}
      </motion.div>
    </section>
  );
}

const features = [
  { icon: Headphones, title: '原声 + 官方字幕', body: '每期就是当天的 tagesschau 节目，一份字幕、一份中文，不重复、不改写。' },
  { icon: Repeat1, title: '逐句跟读与循环', body: '每句播完自动暂停留出跟读时间；难句单句循环，0.75× 慢速。' },
  { icon: MousePointerClick, title: '点词即查', body: '任何一个词都能点开：释义、词性、原句。查词时视频自动暂停。' },
  { icon: BookMarked, title: '生词本 → Anki', body: '收进生词本，拖动排序，一键导出 .apkg，例句和日期都带上。' },
];

function Features() {
  return (
    <section className="mx-auto max-w-[1480px] px-4 py-24 sm:px-6 lg:px-8">
      <div className="grid gap-px overflow-hidden rounded-[28px] border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {features.map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.8, ease, delay: i * 0.07 }}
            className="bg-bg p-7 sm:p-8"
          >
            <f.icon className="size-5 text-accent" strokeWidth={1.75} />
            <h3 className="mt-6 text-[17px] font-semibold tracking-tight text-fg">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function Archive({ items }: { items: CatalogItem[] }) {
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) && document.activeElement !== input.current) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);
  const groups = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = items.filter(it => {
      const hay = [it.date, zhDate(it.date), deDate(it.date), ...it.titles, ...it.titles_zh].join(' ').toLowerCase();
      return terms.every(t => hay.includes(t));
    });
    const m = new Map<string, CatalogItem[]>();
    hits.forEach(it => { const k = it.date.slice(0, 7); m.set(k, [...(m.get(k) || []), it]); });
    return [...m];
  }, [items, q]);

  return (
    <section id="archive" className="mx-auto max-w-[1480px] scroll-mt-20 px-4 pb-28 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-line pb-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Archiv</p>
          <h2 className="mt-2 text-[clamp(32px,4vw,52px)] font-semibold leading-none tracking-[-0.035em] text-fg">往期节目</h2>
        </div>
        <label className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <input
            ref={input}
            type="search"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="搜索主题、日期…"
            aria-label="搜索主题或日期"
            className="h-11 w-full rounded-full border border-line-2 bg-surface/60 pl-10 pr-12 text-sm text-fg outline-none transition placeholder:text-faint focus:border-accent focus:ring-4 focus:ring-accent-soft"
          />
          <kbd className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 rounded border border-line-2 px-1.5 font-mono text-[10px] text-faint">/</kbd>
        </label>
      </div>

      {groups.length === 0 && <p className="py-16 text-center text-muted">没有找到匹配的节目。</p>}
      {groups.map(([month, list]) => (
        <div key={month} className="grid gap-x-10 border-b border-line py-10 lg:grid-cols-[220px_1fr]">
          <div className="mb-4 lg:sticky lg:top-24 lg:mb-0 lg:self-start">
            <p className="text-[28px] font-semibold tracking-[-0.03em] text-fg">{Number(month.slice(5))} 月</p>
            <p className="text-sm text-muted">{month.slice(0, 4)} · {list.length} 期</p>
          </div>
          <ul>
            {list.map((it, i) => (
              <motion.li
                key={it.slug}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.6, ease, delay: Math.min(i, 6) * 0.03 }}
              >
                <a
                  href={`${it.slug}.html`}
                  className="group grid grid-cols-[52px_1fr_auto] items-start gap-4 sm:gap-5 rounded-2xl px-3 py-4 transition-colors hover:bg-surface/70 sm:grid-cols-[84px_1fr_auto] sm:px-4"
                >
                  <span className="leading-none">
                    <span className="block text-[34px] font-semibold tabular tracking-[-0.04em] text-fg sm:text-[40px]">{it.date.slice(8)}</span>
                    <span className="mt-1 block text-xs text-muted">{zhWeekShort(it.date)}</span>
                  </span>
                  <span className="min-w-0 pt-1">
                    <span lang="de" className="line-clamp-2 text-[15px] font-medium leading-snug text-fg sm:line-clamp-1 sm:text-[17px]">{it.titles.slice(0, 3).join(' · ')}</span>
                    <span className="mt-1 line-clamp-1 text-[13px] text-muted">{it.titles_zh.filter(Boolean).slice(0, 3).join(' · ')}</span>
                  </span>
                  <span className="flex items-center gap-3 pt-1.5 text-xs text-faint">
                    <span className="max-sm:hidden">{it.duration ? `${Math.round(it.duration / 60)} 分钟` : `${it.count} 条`}</span>
                    <ArrowUpRight className="size-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-fg" />
                  </span>
                </a>
              </motion.li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

export function HomePage({ items }: { items: CatalogItem[] }) {
  const total = useMemo(() => ({
    lessons: items.length,
    minutes: items.reduce((s, it) => s + (it.duration || 0), 0) / 60,
  }), [items]);
  useEffect(() => { document.title = 'Deutsch Daily — 跟着 tagesschau 学德语'; }, []);
  return (
    <>
      <TopBar transparent>
        <Logo />
        <nav className="ml-auto flex items-center gap-1">
          <Button asChild variant="ghost" size="sm" className="max-sm:hidden"><a href="#archive">往期</a></Button>
          <Button asChild variant="ghost" size="sm" className="max-sm:hidden"><a href="about.html">关于</a></Button>
          <SettingsMenu />
        </nav>
      </TopBar>
      <main>
        <Hero latest={items[0]} total={total} />
        <Features />
        <Archive items={items} />
      </main>
      <Footer />
    </>
  );
}
