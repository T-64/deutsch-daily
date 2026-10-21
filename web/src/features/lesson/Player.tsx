import { AudioLines, ExternalLink, Pause, Play, Repeat1, RotateCcw, SkipBack, SkipForward, StepForward, Video } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { Slider } from '@/components/ui/slider';
import { Tip } from '@/components/ui/tooltip';
import { usePlayer } from '@/lib/player';
import { usePrefs, type PlayMode } from '@/lib/store';
import { clock, cn } from '@/lib/utils';
import { useLesson } from './context';

/* Video with an ambient glow sampled from the picture (drawImage of a cross-origin video is
   allowed for display; we never read pixels back). */
function Ambient({ video }: { video: HTMLVideoElement | null }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current;
    if (!c || !video || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = c.getContext('2d');
    let raf = 0;
    let last = 0;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 250 || video.readyState < 2) return;
      last = t;
      try { ctx?.drawImage(video, 0, 0, c.width, c.height); } catch { /* not ready */ }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [video]);
  return <canvas ref={canvas} width={32} height={18} aria-hidden className="pointer-events-none absolute -inset-[8%] -z-10 h-[116%] w-[116%] scale-110 opacity-[.28] blur-[56px] saturate-150 transition-opacity duration-1000 dark:opacity-75" />;
}

function AudioCard() {
  const { lesson, storyOf } = useLesson();
  const active = usePlayer(s => s.active);
  const playing = usePlayer(s => s.playing);
  const story = lesson.stories[storyOf(active)] ?? lesson.stories[0];
  return (
    <div className="relative flex aspect-[16/7] items-end overflow-hidden rounded-[22px] border border-line bg-gradient-to-br from-surface-2 via-surface to-bg-2 p-6">
      <div className="absolute inset-x-6 top-6 flex h-16 items-end gap-[3px]" aria-hidden>
        {Array.from({ length: 48 }, (_, k) => (
          <motion.span
            key={k}
            className="w-full rounded-full bg-accent/70"
            animate={playing ? { height: ['18%', `${30 + ((k * 37) % 70)}%`, '24%'] } : { height: '12%' }}
            transition={playing ? { duration: 0.9 + (k % 5) * 0.13, repeat: Infinity, ease: 'easeInOut', delay: (k % 7) * 0.05 } : { duration: 0.4 }}
          />
        ))}
      </div>
      <div className="relative">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">仅音频</p>
        <p lang="de" className="mt-1 font-serif text-2xl leading-tight text-fg">{story?.title}</p>
      </div>
    </div>
  );
}

export function Player() {
  const { lesson } = useLesson();
  const attach = usePlayer(s => s.attach);
  const el = usePlayer(s => s.el);
  const failed = usePlayer(s => s.failed);
  const audioOnly = usePrefs(p => p.audioOnly);
  const toggle = usePlayer(s => s.toggle);
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    attach(ref.current);
    return () => attach(null);
  }, [attach]);

  if (!lesson.video.mp4) return null;
  return (
    <div className="relative isolate">
      {!failed && !audioOnly && <Ambient video={el} />}
      <div className={cn('relative overflow-hidden rounded-[22px] bg-black shadow-[var(--shadow)] ring-1 ring-white/10', audioOnly && 'hidden', failed && 'hidden')}>
        <video
          ref={ref}
          src={lesson.video.mp4}
          playsInline
          preload="metadata"
          crossOrigin={undefined}
          onClick={toggle}
          className="block aspect-video w-full cursor-pointer bg-black object-contain"
        />
        <BigPlay />
      </div>
      {audioOnly && !failed && <AudioCard />}
      {failed && (
        <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-[22px] border border-line bg-surface p-6 text-center">
          <Video className="size-6 text-faint" />
          <p className="text-sm text-muted">视频暂时无法加载。字幕和中文仍可阅读。</p>
          {lesson.video.page && (
            <Button asChild variant="outline" size="sm">
              <a href={lesson.video.page} target="_blank" rel="noreferrer">在 tagesschau.de 观看 <ExternalLink /></a>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function BigPlay() {
  const playing = usePlayer(s => s.playing);
  const started = usePlayer(s => s.started);
  const toggle = usePlayer(s => s.toggle);
  return (
    <AnimatePresence>
      {!playing && (
        <motion.button
          type="button"
          onClick={toggle}
          aria-label="播放"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.08 }}
          transition={{ duration: 0.25 }}
          className={cn(
            'absolute inset-0 grid place-items-center bg-gradient-to-t from-black/50 via-black/10 to-transparent',
            started && 'bg-black/25',
          )}
        >
          <span className="grid size-16 place-items-center rounded-full bg-white/90 text-black shadow-2xl backdrop-blur transition-transform hover:scale-105">
            <Play className="ml-1 size-7 fill-current" />
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}

/* Story starts as ticks on the timeline; clicking one jumps to that story. */
function Chapters({ duration }: { duration: number }) {
  const { lesson } = useLesson();
  const playFrom = usePlayer(s => s.playFrom);
  if (!duration) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-0">
      {lesson.stories.map((st, k) => {
        const i = lesson.sentences.slice(st.from, st.to + 1).findIndex(x => x.start != null);
        const t = i >= 0 ? lesson.sentences[st.from + i].start! : null;
        if (t == null || k === 0) return null;
        return (
          <Tip key={k} label={`${String(k + 1).padStart(2, '0')} · ${st.title}`}>
            <button
              type="button"
              aria-label={`跳到第 ${k + 1} 段：${st.title}`}
              onClick={() => playFrom(st.from + i)}
              className="pointer-events-auto absolute top-0 h-3 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-bg ring-1 ring-bg transition hover:h-4 hover:bg-accent"
              style={{ left: `${(t / duration) * 100}%` }}
            />
          </Tip>
        );
      })}
    </div>
  );
}

export function Transport({ compact = false }: { compact?: boolean }) {
  const p = usePlayer();
  const prefs = usePrefs();
  const disabled = !p.el || p.failed;
  return (
    <div className={cn('grid gap-3', disabled && 'pointer-events-none opacity-50')}>
      <div className="flex items-center gap-1">
        <Tip label="上一句" kbd="←"><Button variant="ghost" size="icon" aria-label="上一句" onClick={() => p.step(-1)}><SkipBack /></Button></Tip>
        <Tip label={p.playing ? '暂停' : '播放'} kbd="Space">
          <Button variant="default" size="icon-lg" aria-label={p.playing ? '暂停' : '播放'} onClick={p.toggle} className="mx-1">
            {p.playing ? <Pause className="size-5 fill-current" /> : <Play className="ml-0.5 size-5 fill-current" />}
          </Button>
        </Tip>
        <Tip label="下一句" kbd="→"><Button variant="ghost" size="icon" aria-label="下一句" onClick={() => p.step(1)}><SkipForward /></Button></Tip>
        <Tip label="重听这一句" kbd="R"><Button variant="ghost" size="icon" aria-label="重听这一句" onClick={p.replay}><RotateCcw /></Button></Tip>
        <span className="ml-auto font-mono text-xs tabular text-muted">{clock(p.time)} <span className="text-faint">/ {clock(p.duration || 0)}</span></span>
      </div>
      <div className="relative">
      <Chapters duration={p.duration} />
      <Slider
        value={[p.duration ? (p.time / p.duration) * 1000 : 0]}
        max={1000}
        step={1}
        buffered={p.buffered}
        onValueChange={([v]) => p.seekRatio(v / 1000)}
        aria-label="播放进度"
      />
      </div>
      {!compact && (
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<PlayMode>
            size="sm"
            label="播放方式"
            value={prefs.mode}
            onChange={mode => prefs.set({ mode })}
            options={[
              { value: 'flow', label: <><Play className="size-3.5" />连续</>, title: '一直播放' },
              { value: 'stop', label: <><StepForward className="size-3.5" />逐句跟读</>, title: '每句播完暂停，跟读后按空格继续' },
              { value: 'loop', label: <><Repeat1 className="size-3.5" />单句循环</>, title: '当前句反复播放' },
            ]}
          />
          <Segmented<string>
            size="sm"
            label="语速"
            value={String(prefs.rate)}
            onChange={v => prefs.set({ rate: Number(v) })}
            options={['0.75', '0.9', '1'].map(v => ({ value: v, label: `${v}×` }))}
          />
          <Tip label={prefs.audioOnly ? '显示画面' : '只听声音'}>
            <Button
              variant={prefs.audioOnly ? 'secondary' : 'ghost'}
              size="icon-sm"
              aria-label="仅音频"
              aria-pressed={prefs.audioOnly}
              onClick={() => prefs.set({ audioOnly: !prefs.audioOnly })}
              className={cn('ml-auto', prefs.audioOnly && 'text-accent')}
            >
              <AudioLines />
            </Button>
          </Tip>
        </div>
      )}
    </div>
  );
}
