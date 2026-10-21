import { ArrowUpRight, Play, Search } from 'lucide-react';
import { motion, useScroll, useTransform } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Footer, Logo, SettingsMenu, TopBar } from '@/components/shell';
import type { CatalogItem } from '@/lib/data';
import { cn, de, minutes } from '@/lib/utils';

const ease = [0.16, 1, 0.3, 1] as const;

function HeroVideo({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const v = ref.current;
    if (!v || matchMedia('(prefers-reduced-motion: reduce)').matches || matchMedia('(max-width: 767px)').matches) return;
    v.src = src;
    const start = () => { v.currentTime = 48; v.play().then(() => setOn(true)).catch(() => {}); };
    const loop = () => { if (v.currentTime > 72) v.currentTime = 48; };
    v.addEventListener('loadedmetadata', start, { once: true });
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
      className={cn('absolute inset-0 h-full w-full object-cover transition-opacity duration-[2400ms]', on ? 'opacity-30' : 'opacity-0')}
    />
  );
}

function Latest({ it }: { it: CatalogItem }) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 90]);
  const fade = useTransform(scrollYProgress, [0, 0.85], [1, 0]);
  return (
    <section ref={ref} className="relative isolate -mt-14 overflow-hidden pt-14 grain">
      {it.mp4 && <HeroVideo src={it.mp4} />}
      <div className="absolute inset-0 -z-0 bg-[linear-gradient(to_bottom,transparent,var(--bg)_92%),radial-gradient(90%_70%_at_20%_40%,transparent,var(--bg))]" />
      <motion.a
        href={`${it.slug}.html`}
        style={{ y, opacity: fade }}
        className="group relative mx-auto grid min-h-[min(78svh,820px)] max-w-[1480px] content-end gap-12 px-4 pb-16 pt-24 sm:px-6 lg:grid-cols-[1fr_minmax(0,520px)] lg:items-end lg:px-8 lg:pb-24"
      >
        <div>
          <motion.p
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.2, delay: 0.2 }}
            className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted"
          >
            {de(it.date, { weekday: 'long' })}
          </motion.p>
          <h1 className="mt-4 font-serif text-[clamp(88px,15vw,240px)] leading-[0.82] tracking-[-0.035em] text-fg">
            <motion.span className="block" initial={{ opacity: 0, y: 48 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.2, ease }}>
              {de(it.date, { day: 'numeric' })}.
            </motion.span>
            <motion.span className="block italic text-fg-2" initial={{ opacity: 0, y: 48 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.2, ease, delay: 0.08 }}>
              {de(it.date, { month: 'long' })}
            </motion.span>
          </h1>
        </div>

        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.1, ease, delay: 0.25 }}>
          <ol className="divide-y divide-[var(--line)] border-y border-line">
            {it.titles.slice(0, 5).map((t, i) => (
              <li key={i} lang="de" className="grid grid-cols-[2rem_1fr] py-3.5 text-[17px] leading-snug text-fg-2 transition-colors group-hover:text-fg">
                <span className="pt-0.5 font-mono text-[11px] tabular text-faint">{String(i + 1).padStart(2, '0')}</span>
                {t}
              </li>
            ))}
          </ol>
          <div className="mt-8 flex items-center gap-4">
            <span className="grid size-14 place-items-center rounded-full bg-accent text-accent-fg shadow-[0_10px_40px_-8px_var(--accent)] transition-transform duration-500 ease-[var(--ease-out-expo)] group-hover:scale-110">
              <Play className="ml-0.5 size-5 fill-current" />
            </span>
            {it.duration && <span className="font-mono text-sm tabular text-muted">{minutes(it.duration)}</span>}
          </div>
        </motion.div>
      </motion.a>
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
      const hay = [it.date, de(it.date, { day: 'numeric', month: 'long', weekday: 'long' }), ...it.titles, ...it.titles_zh].join(' ').toLowerCase();
      return terms.every(t => hay.includes(t));
    });
    const m = new Map<string, CatalogItem[]>();
    hits.forEach(it => { const k = it.date.slice(0, 7); m.set(k, [...(m.get(k) || []), it]); });
    return [...m];
  }, [items, q]);

  return (
    <section id="archive" className="mx-auto max-w-[1480px] scroll-mt-20 px-4 pb-32 pt-10 sm:px-6 lg:px-8">
      <div className="flex items-end justify-between gap-6 border-b border-line pb-5">
        <h2 className="font-serif text-[clamp(40px,5vw,64px)] leading-none tracking-[-0.02em] text-fg">Archiv</h2>
        <label className="relative w-44 sm:w-64">
          <Search className="pointer-events-none absolute left-0 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <input
            ref={input}
            type="search"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Suchen"
            aria-label="Suchen"
            className="h-10 w-full border-b border-transparent bg-transparent pl-7 text-sm text-fg outline-none transition placeholder:text-faint focus:border-accent"
          />
        </label>
      </div>

      {groups.map(([month, list]) => (
        <div key={month} className="grid gap-x-10 border-b border-line py-8 lg:grid-cols-[200px_1fr]">
          <p className="mb-3 font-serif text-[26px] italic leading-none text-muted lg:sticky lg:top-24 lg:mb-0 lg:self-start">
            {de(month + '-15', { month: 'long', year: 'numeric' })}
          </p>
          <ul>
            {list.map((it, i) => (
              <motion.li
                key={it.slug}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.6, ease, delay: Math.min(i, 6) * 0.03 }}
              >
                <a href={`${it.slug}.html`} className="group grid grid-cols-[3.5rem_1fr_auto] items-baseline gap-4 rounded-xl px-2 py-3 transition-colors hover:bg-surface/70 sm:grid-cols-[4.5rem_1fr_auto] sm:px-3">
                  <span className="flex items-baseline gap-1.5">
                    <span className="font-serif text-[32px] leading-none tabular text-fg">{it.date.slice(8)}</span>
                    <span className="font-mono text-[10px] uppercase text-faint">{de(it.date, { weekday: 'short' }).replace('.', '')}</span>
                  </span>
                  <span lang="de" className="line-clamp-2 text-[15px] leading-snug text-fg-2 transition-colors group-hover:text-fg sm:line-clamp-1 sm:text-base">
                    {it.titles.slice(0, 3).join(' · ')}
                  </span>
                  <span className="flex items-center gap-3 font-mono text-[11px] tabular text-faint">
                    <span className="max-sm:hidden">{it.duration ? minutes(it.duration) : ''}</span>
                    <ArrowUpRight className="size-4 opacity-0 transition duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-fg group-hover:opacity-100" />
                  </span>
                </a>
              </motion.li>
            ))}
          </ul>
        </div>
      ))}
      {groups.length === 0 && <p className="py-16 text-center font-serif text-2xl italic text-faint">—</p>}
    </section>
  );
}

export function HomePage({ items }: { items: CatalogItem[] }) {
  useEffect(() => { document.title = 'Deutsch Daily'; }, []);
  return (
    <>
      <TopBar transparent>
        <Logo />
        <div className="ml-auto"><SettingsMenu /></div>
      </TopBar>
      <main>
        {items[0] && <Latest it={items[0]} />}
        <Archive items={items.slice(1)} />
      </main>
      <Footer />
    </>
  );
}
