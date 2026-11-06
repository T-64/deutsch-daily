import { AudioLines, ExternalLink, Maximize, Minimize, Minus, Pause, Play, Plus, Repeat1, RotateCcw, SkipBack, SkipForward, StepForward, Timer, Video } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { Slider } from '@/components/ui/slider';
import { Tip } from '@/components/ui/tooltip';
import { usePlayer } from '@/lib/player';
import { usePrefs, useSync, type PlayMode } from '@/lib/store';
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
        <p lang="de" className="font-serif text-3xl leading-tight text-fg">{story?.title}</p>
      </div>
    </div>
  );
}

export function Player() {
  const { lesson } = useLesson();
  const attach = usePlayer(s => s.attach);
  const setStage = usePlayer(s => s.setStage);
  const el = usePlayer(s => s.el);
  const failed = usePlayer(s => s.failed);
  const fullscreen = usePlayer(s => s.fullscreen);
  const audioOnly = usePrefs(p => p.audioOnly);
  const toggle = usePlayer(s => s.toggle);
  const ref = useRef<HTMLVideoElement>(null);
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    attach(ref.current);
    setStage(stage.current);
    return () => { attach(null); setStage(null); };
  }, [attach, setStage]);

  if (!lesson.video.mp4) return null;
  return (
    <div className="relative isolate">
      {!failed && !audioOnly && <Ambient video={el} />}
      <div
        ref={stage}
        className={cn(
          'group/stage relative overflow-hidden rounded-[22px] bg-black shadow-[var(--shadow)] ring-1 ring-white/10',
          '[&:fullscreen]:flex [&:fullscreen]:items-center [&:fullscreen]:rounded-none [&:fullscreen]:ring-0',
          audioOnly && !fullscreen && 'hidden', failed && 'hidden',
        )}
      >
        <video
          ref={ref}
          src={lesson.video.mp4}
          playsInline
          preload="metadata"
          crossOrigin={undefined}
          onClick={toggle}
          className="block aspect-video w-full cursor-pointer bg-black object-contain group-[:fullscreen]/stage:h-full group-[:fullscreen]/stage:aspect-auto"
        />
        <BigPlay />
        {fullscreen && <KinoBar />}
      </div>
      {audioOnly && !failed && <AudioCard />}
      {failed && (
        <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-[22px] border border-line bg-surface p-6 text-center">
          <Video className="size-6 text-faint" />

          {lesson.video.page && (
            <Button asChild variant="outline" size="sm">
              <a href={lesson.video.page} target="_blank" rel="noreferrer">tagesschau.de <ExternalLink /></a>
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
          aria-label="Abspielen"
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
              aria-label={st.title}
              onClick={() => playFrom(st.from + i)}
              className="pointer-events-auto absolute top-0 h-3 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--bg-2)] ring-1 ring-[var(--bg-2)] transition hover:h-4 hover:bg-accent"
              style={{ left: `${(t / duration) * 100}%` }}
            />
          </Tip>
        );
      })}
    </div>
  );
}

/* Controls shown over the video in fullscreen; they fade out while the pointer rests. */
function KinoBar() {
  const p = usePlayer();
  const [awake, setAwake] = useState(true);
  useEffect(() => {
    let t = 0;
    const wake = () => { setAwake(true); clearTimeout(t); t = window.setTimeout(() => setAwake(false), 2500); };
    wake();
    const stage = usePlayer.getState().stage;
    stage?.addEventListener('pointermove', wake);
    window.addEventListener('keydown', wake);
    return () => { clearTimeout(t); stage?.removeEventListener('pointermove', wake); window.removeEventListener('keydown', wake); };
  }, []);
  const show = awake || !p.playing;
  return (
    <div
      className={cn(
        'absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-6 pb-6 pt-16 text-white transition-opacity duration-500',
        show ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
      style={{ cursor: show ? undefined : 'none' }}
    >
      <Slider
        value={[p.duration ? (p.time / p.duration) * 1000 : 0]}
        max={1000}
        step={1}
        buffered={p.buffered}
        onValueChange={([v]) => p.seekRatio(v / 1000)}
        aria-label="Position"
        className="[&_[data-orientation]]:bg-white/25 [&_span[data-orientation]>span]:bg-white"
      />
      <div className="mt-3 flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label="Zurück" onClick={() => p.step(-1)} className="text-white hover:bg-white/15 hover:text-white"><SkipBack /></Button>
        <Button size="icon-lg" aria-label={p.playing ? 'Pause' : 'Abspielen'} onClick={p.toggle} className="mx-1 bg-white text-black hover:bg-white">
          {p.playing ? <Pause className="size-5 fill-current" /> : <Play className="ml-0.5 size-5 fill-current" />}
        </Button>
        <Button variant="ghost" size="icon" aria-label="Weiter" onClick={() => p.step(1)} className="text-white hover:bg-white/15 hover:text-white"><SkipForward /></Button>
        <span className="ml-3 font-mono text-xs tabular text-white/80">{clock(p.time)} / {clock(p.duration || 0)}</span>
        <Button variant="ghost" size="icon" aria-label="Vollbild beenden" onClick={p.toggleFullscreen} className="ml-auto text-white hover:bg-white/15 hover:text-white"><Minimize /></Button>
      </div>
    </div>
  );
}

/* Viewer's own subtitle offset for this lesson, in 0.25 s steps ([ and ] on the keyboard). */
export function SyncControl() {
  const { lesson } = useLesson();
  const d = useSync(s => s.offsets[lesson.slug] ?? 0);
  const setOffset = useSync(s => s.setOffset);
  const nudge = (by: number) => setOffset(lesson.slug, Math.max(-10, Math.min(10, d + by)));
  return (
    <div className="inline-flex items-center rounded-full bg-surface-2 p-1" role="group" aria-label="Untertitel-Versatz">
      <Tip label="Untertitel früher" kbd="["><Button variant="ghost" size="icon-sm" className="size-7" aria-label="Untertitel früher" onClick={() => nudge(-0.25)}><Minus /></Button></Tip>
      <Tip label={d ? 'Zurücksetzen' : 'Untertitel-Versatz'}>
        <button
          type="button"
          onClick={() => setOffset(lesson.slug, 0)}
          className={cn('inline-flex h-7 min-w-[4.25rem] items-center justify-center gap-1 rounded-full px-1.5 font-mono text-xs tabular', d ? 'text-accent' : 'text-muted')}
          aria-label={`Untertitel-Versatz ${d.toFixed(2)} Sekunden, zurücksetzen`}
        >
          <Timer className="size-3.5" />{d > 0 ? '+' : ''}{d.toFixed(2)}s
        </button>
      </Tip>
      <Tip label="Untertitel später" kbd="]"><Button variant="ghost" size="icon-sm" className="size-7" aria-label="Untertitel später" onClick={() => nudge(0.25)}><Plus /></Button></Tip>
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
        <Tip label="Zurück" kbd="←"><Button variant="ghost" size="icon" aria-label="Zurück" onClick={() => p.step(-1)}><SkipBack /></Button></Tip>
        <Tip label={p.playing ? 'Pause' : 'Abspielen'} kbd="Space">
          <Button variant="default" size="icon-lg" aria-label={p.playing ? 'Pause' : 'Abspielen'} onClick={p.toggle} className="mx-1">
            {p.playing ? <Pause className="size-5 fill-current" /> : <Play className="ml-0.5 size-5 fill-current" />}
          </Button>
        </Tip>
        <Tip label="Weiter" kbd="→"><Button variant="ghost" size="icon" aria-label="Weiter" onClick={() => p.step(1)}><SkipForward /></Button></Tip>
        <Tip label="Wiederholen" kbd="R"><Button variant="ghost" size="icon" aria-label="Wiederholen" onClick={p.replay}><RotateCcw /></Button></Tip>
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
        aria-label="Position"
      />
      </div>
      {!compact && (
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<PlayMode>
            size="sm"
            label="Modus"
            value={prefs.mode}
            onChange={mode => prefs.set({ mode })}
            options={[
              { value: 'flow', label: <Play className="size-3.5" />, title: 'Durchgehend' },
              { value: 'stop', label: <StepForward className="size-3.5" />, title: 'Satz für Satz' },
              { value: 'loop', label: <Repeat1 className="size-3.5" />, title: 'Schleife' },
            ]}
          />
          <Segmented<string>
            size="sm"
            label="Tempo"
            value={String(prefs.rate)}
            onChange={v => prefs.set({ rate: Number(v) })}
            options={['0.75', '0.9', '1'].map(v => ({ value: v, label: `${v}×` }))}
          />
          <SyncControl />
          <Tip label={prefs.audioOnly ? 'Video' : 'Nur Audio'}>
            <Button
              variant={prefs.audioOnly ? 'secondary' : 'ghost'}
              size="icon-sm"
              aria-label="Nur Audio"
              aria-pressed={prefs.audioOnly}
              onClick={() => prefs.set({ audioOnly: !prefs.audioOnly })}
              className={cn('ml-auto', prefs.audioOnly && 'text-accent')}
            >
              <AudioLines />
            </Button>
          </Tip>
          <Tip label="Vollbild" kbd="F">
            <Button variant="ghost" size="icon-sm" aria-label="Vollbild" onClick={() => { prefs.set({ audioOnly: false }); p.toggleFullscreen(); }}>
              <Maximize />
            </Button>
          </Tip>
        </div>
      )}
    </div>
  );
}
