import { ArrowLeft, BookOpen, Captions, ExternalLink, EyeOff, Languages, Pause, Play, Repeat1, SkipBack, SkipForward, StepForward } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Footer, Logo, SettingsMenu, TopBar } from '@/components/shell';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { Segmented } from '@/components/ui/segmented';
import { Tip } from '@/components/ui/tooltip';
import type { Lesson } from '@/lib/data';
import { usePlayer } from '@/lib/player';
import { recent, usePrefs, type PlayMode, type ZhMode } from '@/lib/store';
import { cn, de } from '@/lib/utils';
import { trackStuck } from '@/lib/stuck';
import { LessonProvider, useLesson } from '@/features/lesson/context';
import { Player, Transport } from '@/features/lesson/Player';
import { Study } from '@/features/lesson/Study';
import { Transcript } from '@/features/lesson/Transcript';
import { WordCard, useWordCard } from '@/features/lesson/WordCard';

function useIsDesktop() {
  const q = '(min-width: 1024px)';
  const [d, setD] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q);
    const on = () => setD(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return d;
}

function useKeyboard() {
  const zh = usePrefs(p => p.zh);
  const set = usePrefs(p => p.set);
  useEffect(() => {
    const order: ZhMode[] = ['hidden', 'current', 'all'];
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || t.closest('input, textarea, select, [contenteditable], [role="dialog"], [role="menu"]')) return;
      const p = usePlayer.getState();
      if (e.key === ' ' && !t.closest('.dd-word')) { e.preventDefault(); p.toggle(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); p.step(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); p.step(1); }
      else if (e.key === 'r' || e.key === 'R') p.replay();
      else if (e.key === 't' || e.key === 'T') set({ zh: order[(order.indexOf(zh) + 1) % order.length] });
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [zh, set]);
}

function ZhToggle({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const zh = usePrefs(p => p.zh);
  const set = usePrefs(p => p.set);
  return (
    <Segmented<ZhMode>
      label="Übersetzung"
      size={size}
      value={zh}
      onChange={v => set({ zh: v })}
      options={[
        { value: 'hidden', label: <EyeOff className="size-3.5" />, title: 'Aus (T)' },
        { value: 'current', label: <Languages className="size-3.5" />, title: 'Aktueller Satz (T)' },
        { value: 'all', label: <Captions className="size-3.5" />, title: 'Alle (T)' },
      ]}
    />
  );
}

function Masthead() {
  const { lesson } = useLesson();
  const href = lesson.video.page || lesson.source_url;
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted">{de(lesson.date, { weekday: 'long' })}</p>
        <h1 className="mt-2 font-serif text-[clamp(44px,4.2vw,64px)] leading-[0.9] tracking-[-0.02em] text-fg">
          {de(lesson.date, { day: 'numeric' })}. <span className="italic text-fg-2">{de(lesson.date, { month: 'long' })}</span>
        </h1>
      </div>
      {href && (
        <Tip label="tagesschau.de">
          <Button asChild variant="ghost" size="icon" aria-label="tagesschau.de"><a href={href} target="_blank" rel="noreferrer"><ExternalLink /></a></Button>
        </Tip>
      )}
    </div>
  );
}

function NowPlaying() {
  const { lesson, storyOf } = useLesson();
  const active = usePlayer(s => s.active);
  const started = usePlayer(s => s.started);
  const playing = usePlayer(s => s.playing);
  const k = storyOf(active);
  const story = lesson.stories[k];
  return (
    <div className="pointer-events-none absolute left-1/2 hidden -translate-x-1/2 lg:block">
      <AnimatePresence mode="wait">
        {started && story && (
          <motion.p
            key={k}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="flex max-w-[36vw] items-center gap-2.5 text-[13px] text-fg-2"
          >
            <span className={cn('size-1.5 shrink-0 rounded-full bg-accent', playing && 'animate-pulse')} />
            <span className="font-mono text-[11px] tabular text-faint">{String(k + 1).padStart(2, '0')}/{String(lesson.stories.length).padStart(2, '0')}</span>
            <span lang="de" className="truncate font-medium">{story.title}</span>
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function ResizeHandle() {
  return (
    <PanelResizeHandle className="group relative w-px bg-line outline-none transition-colors data-[resize-handle-state=drag]:bg-accent data-[resize-handle-state=hover]:bg-line-2">
      <span className="absolute left-1/2 top-1/2 h-10 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-line-2 opacity-0 transition-opacity group-hover:opacity-100 group-data-[resize-handle-state=drag]:bg-accent group-data-[resize-handle-state=drag]:opacity-100" />
    </PanelResizeHandle>
  );
}

function Desktop() {
  const right = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState('story');
  return (
    <PanelGroup direction="horizontal" autoSaveId="dd-lesson-split" className="!h-[calc(100dvh-56px)]">
      <Panel defaultSize={42} minSize={30} maxSize={58} className="flex">
        <div className="flex min-h-0 w-full flex-col gap-6 overflow-y-auto px-8 pb-8 pt-7 scrollbar-thin xl:px-10">
          <Masthead />
          <Player />
          <Transport />
          <Study tab={tab} onTab={setTab} className="min-h-[360px] flex-1" />
        </div>
      </Panel>
      <ResizeHandle />
      <Panel minSize={36} className="flex">
        <div ref={right} className="relative min-h-0 w-full overflow-y-auto scrollbar-thin">
          <div className="mx-auto max-w-[780px] px-8 pb-[45vh] pt-2 xl:px-12">
            <Transcript scroller={right} />
          </div>
        </div>
      </Panel>
    </PanelGroup>
  );
}

function Mobile() {
  const media = useRef<HTMLDivElement>(null);
  const doc = useRef<HTMLElement | null>(document.scrollingElement as HTMLElement);
  const [drawer, setDrawer] = useState<string | null>(null);
  const p = usePlayer();
  const prefs = usePrefs();
  const modes: { v: PlayMode; icon: React.ReactNode; label: string }[] = [
    { v: 'flow', icon: <Play className="size-4" />, label: 'Durchgehend' },
    { v: 'stop', icon: <StepForward className="size-4" />, label: 'Satz für Satz' },
    { v: 'loop', icon: <Repeat1 className="size-4" />, label: 'Schleife' },
  ];
  useLayoutEffect(() => {
    const el = media.current;
    if (!el) return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--media-h', `${el.offsetHeight}px`));
    ro.observe(el);
    const untrack = trackStuck(window, '[data-media]');
    return () => { ro.disconnect(); untrack(); };
  }, []);
  return (
    <>
      <div className="px-4 pb-4 pt-5"><Masthead /></div>
      <div ref={media} data-media className="dd-stick sticky top-14 z-20 px-3 pb-2 pt-1">
        <Player />
      </div>
      <div className="px-4 pb-40 [--sticky-top:calc(56px+var(--media-h,0px))] [&_header.sticky]:top-[var(--sticky-top)]">
        <Transcript scroller={doc} />
      </div>
      <div className="fixed inset-x-0 bottom-0 z-30 dd-frost border-t border-line px-3 pb-[calc(10px+env(safe-area-inset-bottom))] pt-2.5 backdrop-blur-xl">
        <div className="mx-auto flex max-w-xl items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Zurück" onClick={() => p.step(-1)} disabled={!p.el}><SkipBack /></Button>
          <Button size="icon-lg" aria-label={p.playing ? 'Pause' : 'Abspielen'} onClick={p.toggle} disabled={!p.el || p.failed}>
            {p.playing ? <Pause className="size-5 fill-current" /> : <Play className="ml-0.5 size-5 fill-current" />}
          </Button>
          <Button variant="ghost" size="icon" aria-label="Weiter" onClick={() => p.step(1)} disabled={!p.el}><SkipForward /></Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => prefs.set({ mode: modes[(modes.findIndex(m => m.v === prefs.mode) + 1) % modes.length].v })}
            className={cn(prefs.mode !== 'flow' && 'text-accent')}
            aria-label={modes.find(m => m.v === prefs.mode)?.label}
          >
            {modes.find(m => m.v === prefs.mode)?.icon}
          </Button>
          <Button variant="secondary" size="icon" className="ml-auto" aria-label="Wörter" onClick={() => setDrawer('story')}><BookOpen /></Button>
        </div>
      </div>
      <Drawer open={!!drawer} onOpenChange={o => setDrawer(o ? drawer ?? 'story' : null)} title="Lektion">
        <div className="mb-6 grid gap-4">
          <Transport />
          <div><ZhToggle size="sm" /></div>
        </div>
        <Study tab={drawer ?? 'story'} onTab={setDrawer} />
      </Drawer>
    </>
  );
}

function Body() {
  const { lesson } = useLesson();
  const desktop = useIsDesktop();
  const setSentences = usePlayer(s => s.setSentences);
  const close = useWordCard(s => s.close);
  useKeyboard();
  useEffect(() => setSentences(lesson.sentences), [lesson, setSentences]);
  useEffect(() => {
    recent.set({ slug: lesson.slug, date: lesson.date, title: lesson.stories.find(s => s.vocab.length)?.title || lesson.stories[0]?.title || '' });
    document.title = `${de(lesson.date, { day: 'numeric', month: 'long' })} — Deutsch Daily`;
  }, [lesson]);
  useEffect(() => close, [close]);
  return (
    <div className={cn(desktop && 'h-dvh overflow-hidden')}>
      <TopBar>
        <Button variant="ghost" size="icon" asChild aria-label="Archiv"><a href="index.html"><ArrowLeft /></a></Button>
        <Logo className="max-sm:hidden" />
        <NowPlaying />
        <div className="ml-auto flex items-center gap-2">
          <div className="max-lg:hidden"><ZhToggle /></div>
          <SettingsMenu />
        </div>
      </TopBar>
      {desktop ? <Desktop /> : <Mobile />}
      {!desktop && <Footer />}
      <WordCard />
    </div>
  );
}

export function LessonPage({ lesson }: { lesson: Lesson }) {
  return (
    <LessonProvider lesson={lesson}>
      <Body />
    </LessonProvider>
  );
}
