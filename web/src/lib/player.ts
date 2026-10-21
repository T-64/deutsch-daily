import { create } from 'zustand';
import type { Sentence } from './data';
import { usePrefs } from './store';

/* Sentence-aware media engine. One <video> element is registered by <Player/>; everything
   else (transcript, dock, keyboard) talks to this store. */

interface Seg { i: number; a: number; b: number }

interface PlayerState {
  el: HTMLVideoElement | null;
  segs: Seg[];
  time: number;
  duration: number;
  buffered: number;
  playing: boolean;
  ready: boolean;
  failed: boolean;
  active: number; // sentence index under the playhead (-1 = none)
  target: number; // sentence the stepped modes stop after
  started: boolean;
  attach: (el: HTMLVideoElement | null) => void;
  setSentences: (s: Sentence[]) => void;
  toggle: () => void;
  playFrom: (i: number) => void;
  step: (d: number) => void;
  replay: () => void;
  seekRatio: (r: number) => void;
}

function segAt(segs: Seg[], t: number) {
  let k = -1;
  for (const s of segs) {
    if (s.a <= t + 0.05) k = s.i;
    else break;
  }
  return k;
}
const segByIndex = (segs: Seg[], i: number) => segs.find(s => s.i === i);

export const usePlayer = create<PlayerState>()((set, get) => {
  let detach: (() => void) | null = null;

  function onTime() {
    const { el, segs, target } = get();
    if (!el) return;
    const t = el.currentTime;
    const { mode } = usePrefs.getState();
    const tgt = segByIndex(segs, target);
    if (mode !== 'flow' && tgt && !el.paused && t >= tgt.b + 0.12) {
      if (mode === 'loop') { el.currentTime = tgt.a; return; }
      el.pause();
      el.currentTime = Math.max(tgt.a, tgt.b - 0.02);
      return;
    }
    const active = segAt(segs, t);
    let buffered = 0;
    if (el.buffered.length && el.duration) buffered = el.buffered.end(el.buffered.length - 1) / el.duration;
    set({ time: t, active, buffered, target: mode === 'flow' || target < 0 ? active : target });
  }

  return {
    el: null, segs: [], time: 0, duration: 0, buffered: 0, playing: false, ready: false, failed: false,
    active: -1, target: -1, started: false,

    attach: el => {
      detach?.();
      detach = null;
      set({ el, ready: false, failed: false, playing: false });
      if (!el) return;
      const events: [string, () => void][] = [
        ['timeupdate', onTime],
        ['seeked', onTime],
        ['loadedmetadata', () => { el.playbackRate = usePrefs.getState().rate; set({ duration: el.duration, ready: true }); }],
        ['durationchange', () => set({ duration: el.duration })],
        ['play', () => set({ playing: true, started: true })],
        ['pause', () => set({ playing: false })],
        ['ended', () => set({ playing: false })],
        ['error', () => set({ failed: true, playing: false })],
      ];
      events.forEach(([e, f]) => el.addEventListener(e, f));
      detach = () => events.forEach(([e, f]) => el.removeEventListener(e, f));
      if (el.readyState >= 1) set({ duration: el.duration, ready: true });
    },

    setSentences: sentences => {
      const segs = sentences
        .map((s, i) => ({ i, a: s.start ?? NaN, b: s.end ?? s.start ?? NaN }))
        .filter(s => Number.isFinite(s.a))
        .sort((x, y) => x.a - y.a);
      set({ segs });
    },

    toggle: () => {
      const { el, segs, time } = get();
      if (!el) return;
      if (!el.paused) { el.pause(); return; }
      const k = segAt(segs, time);
      const cur = segByIndex(segs, k);
      // In stepped modes, after an automatic stop "play" moves on to the next sentence.
      if (usePrefs.getState().mode !== 'flow' && cur && el.currentTime >= cur.b - 0.05) {
        const next = segs[segs.indexOf(cur) + 1];
        if (next) { get().playFrom(next.i); return; }
      }
      set({ target: k });
      el.play().catch(() => {});
    },

    playFrom: i => {
      const { el, segs } = get();
      const s = segByIndex(segs, i);
      if (!el || !s) return;
      el.currentTime = s.a;
      set({ target: i, active: i, time: s.a });
      el.play().catch(() => {});
    },

    step: d => {
      const { segs, active, time } = get();
      if (!segs.length) return;
      const cur = active >= 0 ? active : segAt(segs, time);
      const pos = segs.findIndex(s => s.i === cur);
      const next = segs[Math.max(0, Math.min(segs.length - 1, (pos < 0 ? -1 : pos) + d))];
      if (next) get().playFrom(next.i);
    },

    replay: () => {
      const { active, segs } = get();
      get().playFrom(active >= 0 ? active : segs[0]?.i ?? 0);
    },

    seekRatio: r => {
      const { el, segs } = get();
      if (!el || !el.duration) return;
      el.currentTime = r * el.duration;
      set({ target: segAt(segs, el.currentTime), time: el.currentTime });
    },
  };
});

usePrefs.subscribe(s => {
  const el = usePlayer.getState().el;
  if (el && el.playbackRate !== s.rate) el.playbackRate = s.rate;
});
