import { ArrowDown, Languages } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { Sentence } from '@/lib/data';
import { usePlayer } from '@/lib/player';
import { useNotebook, usePrefs } from '@/lib/store';
import { clock, cn } from '@/lib/utils';
import { useLesson } from './context';
import { useWordCard } from './WordCard';

function Equalizer() {
  const playing = usePlayer(s => s.playing);
  return (
    <span className="flex h-3.5 items-end gap-[2px]" aria-hidden>
      {[0, 1, 2, 3].map(k => (
        <motion.span
          key={k}
          className="w-[3px] rounded-full bg-accent"
          animate={playing ? { height: ['30%', '100%', '45%', '80%', '30%'] } : { height: '35%' }}
          transition={playing ? { duration: 0.9 + k * 0.17, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
        />
      ))}
    </span>
  );
}

/* Lyrics-style transcript: official sentences, timed, one Chinese line under each. */

const Line = memo(function Line({
  s, i, state, revealed, timed, saved,
}: {
  s: Sentence; i: number; state: 'active' | 'past' | 'future' | 'static'; revealed: boolean; timed: boolean; saved: Set<string>;
}) {
  const { tokenize, lesson } = useLesson();
  const zhMode = usePrefs(p => p.zh);
  const showZh = !!s.zh && (zhMode === 'all' || revealed || (zhMode === 'current' && state === 'active'));
  const dim = state === 'past' || state === 'future';
  return (
    <motion.div
      data-i={i}
      layout="position"
      className={cn(
        'group relative grid grid-cols-[3.25rem_1fr] gap-x-3 rounded-2xl py-2.5 pr-3 transition-[opacity,filter] duration-500 ease-out',
        dim && 'opacity-[var(--lyric-dim)] hover:opacity-80',
        state === 'past' && 'blur-[0.2px]',
      )}
    >
      <div className="pt-[0.42em]">
        {timed && (
          <button
            type="button"
            data-seek={i}
            aria-label={clock(s.start)}
            className={cn(
              'inline-flex h-6 items-center gap-1 rounded-full px-1.5 font-mono text-[11px] tabular text-faint transition',
              'hover:bg-surface-2 hover:text-fg',
              state === 'active' && 'text-accent hover:text-accent',
            )}
          >
            {state === 'active' ? <Equalizer /> : clock(s.start)}
          </button>
        )}
      </div>
      <div className="min-w-0">
        <p
          lang="de"
          className={cn(
            'origin-left text-pretty font-semibold tracking-[-0.012em] text-fg transition-[transform] duration-500 ease-[var(--ease-out-expo)]',
            'text-[calc(clamp(19px,1.55vw,25px)*var(--reader-scale))] leading-[1.42]',
            state === 'active' && 'scale-[1.035]',
          )}
        >
          {tokenize(s.de).map((t, k) =>
            t.key ? (
              <span
                key={k}
                className="dd-word"
                data-key={t.key}
                data-ed={lesson.gloss[t.key]?.source === 'editorial' ? '1' : undefined}
                data-saved={saved.has(t.key) ? '1' : undefined}
                role="button"
                tabIndex={0}
              >
                {t.text}
              </span>
            ) : (
              <span key={k}>{t.text}</span>
            ),
          )}
          {s.zh && zhMode !== 'all' && !showZh && (
            <button
              type="button"
              data-reveal={i}
              aria-label="Übersetzung"
              className="ml-2 inline-flex size-6 translate-y-[-2px] items-center justify-center rounded-full align-middle text-faint opacity-0 transition hover:bg-surface-2 hover:text-fg group-hover:opacity-100 focus-visible:opacity-100 max-lg:opacity-60"
            >
              <Languages className="size-3.5" />
            </button>
          )}
        </p>
        <AnimatePresence initial={false}>
          {showZh && (
            <motion.p
              initial={{ opacity: 0, height: 0, y: -4 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: -4 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <span className="block pt-1.5 text-[calc(15.5px*var(--reader-scale))] leading-relaxed text-muted">{s.zh}</span>
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
});

export function Transcript({ scroller }: { scroller: React.RefObject<HTMLElement | null> }) {
  const { lesson } = useLesson();
  const active = usePlayer(s => s.active);
  const started = usePlayer(s => s.started);
  const hasVideo = usePlayer(s => !!s.el && !s.failed);
  const playFrom = usePlayer(s => s.playFrom);
  const follow = usePrefs(p => p.follow);
  const zhMode = usePrefs(p => p.zh);
  const words = useNotebook(s => s.words);
  const openWord = useWordCard(s => s.open);
  const [revealed, setRevealed] = useState<Set<number>>(() => new Set());
  const [detached, setDetached] = useState(false);
  const programmatic = useRef(0);
  const saved = new Set(words.map(w => w.key));
  const timed = hasVideo;

  const onReveal = useCallback((i: number) => setRevealed(r => new Set(r).add(i)), []);

  /* keep the active line in the upper third, Apple-Music style */
  const center = useCallback((smooth = true) => {
    const box = scroller.current;
    const el = box?.querySelector<HTMLElement>(`[data-i="${usePlayer.getState().active}"]`);
    if (!box || !el) return;
    const isWindow = box === document.scrollingElement;
    const boxTop = isWindow ? 0 : box.getBoundingClientRect().top;
    const offset = el.getBoundingClientRect().top - boxTop - box.clientHeight * (isWindow ? 0.42 : 0.32);
    programmatic.current = Date.now();
    (isWindow ? window : box).scrollBy({ top: offset, behavior: smooth ? 'smooth' : 'auto' });
  }, [scroller]);

  useEffect(() => {
    if (active < 0 || !follow || detached || !started) return;
    center();
  }, [active, follow, detached, started, center]);

  useEffect(() => {
    const box = scroller.current;
    if (!box) return;
    const target: HTMLElement | Window = box === document.scrollingElement ? window : box;
    const onScroll = () => {
      if (Date.now() - programmatic.current < 900) return;
      if (usePlayer.getState().playing) setDetached(true);
    };
    const onUser = () => { programmatic.current = 0; };
    target.addEventListener('scroll', onScroll, { passive: true });
    target.addEventListener('wheel', onUser, { passive: true });
    target.addEventListener('touchmove', onUser, { passive: true });
    return () => {
      target.removeEventListener('scroll', onScroll);
      target.removeEventListener('wheel', onUser);
      target.removeEventListener('touchmove', onUser);
    };
  }, [scroller]);

  function onClick(e: React.MouseEvent) {
    const el = e.target as HTMLElement;
    const word = el.closest<HTMLElement>('.dd-word');
    if (word) {
      const line = word.closest<HTMLElement>('[data-i]');
      const i = Number(line?.dataset.i ?? -1);
      const story = lesson.stories[lesson.stories.findIndex(s => i >= s.from && i <= s.to)];
      openWord({ el: word, key: word.dataset.key!, surface: word.textContent || '', sentence: lesson.sentences[i]?.de || '', topic: story?.title || '' });
      return;
    }
    const seek = el.closest<HTMLElement>('[data-seek]');
    if (seek) { setDetached(false); playFrom(Number(seek.dataset.seek)); return; }
    const reveal = el.closest<HTMLElement>('[data-reveal]');
    if (reveal) onReveal(Number(reveal.dataset.reveal));
  }
  function onKey(e: React.KeyboardEvent) {
    const word = (e.target as HTMLElement).closest('.dd-word');
    if (word && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); onClick(e as unknown as React.MouseEvent); }
  }

  const stateOf = (i: number): 'active' | 'past' | 'future' | 'static' => {
    if (!timed || !started || active < 0) return 'static';
    if (i === active) return 'active';
    return i < active ? 'past' : 'future';
  };

  return (
    <div onClick={onClick} onKeyDown={onKey} className="relative">
      {lesson.stories.map((story, k) => (
        <section key={k} id={`story-${k + 1}`} aria-labelledby={`story-h-${k}`} className="scroll-mt-28 pb-6">
          <header className="sticky top-0 z-10 -mx-1 mb-1 bg-bg px-1 pb-3 pt-6 after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-8 after:bg-gradient-to-b after:from-[var(--bg)] after:to-transparent">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-[11px] tabular text-accent">{String(k + 1).padStart(2, '0')}</span>
              <h2 id={`story-h-${k}`} lang="de" className="font-serif text-[28px] leading-tight tracking-[-0.01em] text-fg">{story.title}</h2>
            </div>
            {story.title_zh && zhMode !== 'hidden' && <p className="mt-0.5 pl-[calc(11px*2+12px)] text-[13px] text-muted">{story.title_zh}</p>}
          </header>
          {lesson.sentences.slice(story.from, story.to + 1).map((s, j) => {
            const i = story.from + j;
            return <Line key={i} s={s} i={i} state={stateOf(i)} revealed={revealed.has(i)} timed={timed && s.start != null} saved={saved} />;
          })}
        </section>
      ))}

      <AnimatePresence>
        {detached && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="pointer-events-none sticky bottom-6 z-20 flex justify-center max-lg:bottom-24"
          >
            <Button variant="secondary" size="icon" aria-label="Aktueller Satz" className="pointer-events-auto shadow-[var(--shadow)] backdrop-blur" onClick={() => { setDetached(false); center(); }}>
              <ArrowDown />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
