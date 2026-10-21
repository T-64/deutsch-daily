import { ArrowLeft, BookOpen, ExternalLink, Pause, Play, Repeat1, SkipBack, SkipForward, StepForward } from 'lucide-react';
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
import { cn, deDate, zhDate } from '@/lib/utils';
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
      label="中文译文"
      size={size}
      value={zh}
      onChange={v => set({ zh: v })}
      options={[
        { value: 'hidden', label: '盲听', title: '隐藏中文，可逐句点开（T 切换）' },
        { value: 'current', label: '当前句', title: '只显示正在播放这一句的中文' },
        { value: 'all', label: '全部', title: '显示全部中文' },
      ]}
    />
  );
}

function Masthead() {
  const { lesson } = useLesson();
  const mins = lesson.duration ? Math.max(1, Math.round(lesson.duration / 60)) : null;
  return (
    <div>
      <p className="flex items-center gap-2 text-xs font-medium text-muted">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2 py-0.5 text-accent">
          <span className="size-1.5 rounded-full bg-accent" />{lesson.show}
        </span>
        <span>{lesson.level}</span>
      </p>
      <h1 className="mt-3 text-[clamp(28px,3vw,40px)] font-semibold leading-[1.1] tracking-[-0.025em] text-fg">{zhDate(lesson.date)}</h1>
      <p lang="de" className="mt-1 font-serif text-[17px] italic text-muted">{deDate(lesson.date)}</p>
      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
        <span>{lesson.stories.length} 段</span>
        <span>{lesson.sentences.length} 句</span>
        {mins && <span>{mins} 分钟</span>}
        {(lesson.video.page || lesson.source_url) && (
          <a className="inline-flex items-center gap-1 hover:text-fg" href={lesson.video.page || lesson.source_url} target="_blank" rel="noreferrer">
            tagesschau.de <ExternalLink className="size-3" />
          </a>
        )}
      </p>
      {lesson.note && <p className="mt-4 border-l-2 border-line-2 pl-3 text-xs leading-relaxed text-muted">{lesson.note}</p>}
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
    { v: 'flow', icon: <Play className="size-3.5" />, label: '连续' },
    { v: 'stop', icon: <StepForward className="size-3.5" />, label: '逐句' },
    { v: 'loop', icon: <Repeat1 className="size-3.5" />, label: '循环' },
  ];
  useLayoutEffect(() => {
    const el = media.current;
    if (!el) return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--media-h', `${el.offsetHeight}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <>
      <div className="px-4 pb-4 pt-5"><Masthead /></div>
      <div ref={media} className="sticky top-14 z-20 bg-bg px-3 pb-2 pt-1">
        <Player />
      </div>
      <div className="px-4 pb-40 [--sticky-top:calc(56px+var(--media-h,0px))] [&_header.sticky]:top-[var(--sticky-top)]">
        <Transcript scroller={doc} />
      </div>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-[color-mix(in_oklch,var(--bg)_86%,transparent)] px-3 pb-[calc(10px+env(safe-area-inset-bottom))] pt-2.5 backdrop-blur-xl">
        <div className="mx-auto flex max-w-xl items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="上一句" onClick={() => p.step(-1)} disabled={!p.el}><SkipBack /></Button>
          <Button size="icon-lg" aria-label={p.playing ? '暂停' : '播放'} onClick={p.toggle} disabled={!p.el || p.failed}>
            {p.playing ? <Pause className="size-5 fill-current" /> : <Play className="ml-0.5 size-5 fill-current" />}
          </Button>
          <Button variant="ghost" size="icon" aria-label="下一句" onClick={() => p.step(1)} disabled={!p.el}><SkipForward /></Button>
          <button
            type="button"
            onClick={() => prefs.set({ mode: modes[(modes.findIndex(m => m.v === prefs.mode) + 1) % modes.length].v })}
            className="ml-1 inline-flex h-8 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-xs font-medium text-fg-2"
            aria-label="切换播放方式"
          >
            {modes.find(m => m.v === prefs.mode)?.icon}{modes.find(m => m.v === prefs.mode)?.label}
          </button>
          <Button variant="secondary" size="sm" className="ml-auto" onClick={() => setDrawer('story')}><BookOpen />学习</Button>
        </div>
      </div>
      <Drawer open={!!drawer} onOpenChange={o => setDrawer(o ? drawer ?? 'story' : null)} title="学习面板">
        <div className="mb-5 grid gap-4">
          <Transport />
          <div className="flex items-center justify-between gap-3"><span className="text-sm text-muted">中文</span><ZhToggle size="sm" /></div>
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
    document.title = `${zhDate(lesson.date)} · ${lesson.show} — Deutsch Daily`;
  }, [lesson]);
  useEffect(() => close, [close]);
  return (
    <div className={cn(desktop && 'h-dvh overflow-hidden')}>
      <TopBar>
        <Tip label="全部课程" side="bottom">
          <Button variant="ghost" size="icon" asChild aria-label="全部课程"><a href="index.html"><ArrowLeft /></a></Button>
        </Tip>
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
