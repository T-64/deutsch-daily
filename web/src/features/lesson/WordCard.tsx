import * as Popover from '@radix-ui/react-popover';
import { Check, Pencil, Plus, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useNotebook } from '@/lib/store';
import { usePlayer } from '@/lib/player';
import { glossFor } from '@/lib/words';
import { useLesson } from './context';

/* One shared popover; any word in the page opens it via openWord(). */
interface WordTarget { el: HTMLElement; key: string; surface: string; sentence: string; topic: string }
interface WordState { target: WordTarget | null; resume: boolean; open: (t: WordTarget) => void; close: () => void }

export const useWordCard = create<WordState>()((set, get) => ({
  target: null,
  resume: false,
  open: t => {
    const p = usePlayer.getState();
    const wasPlaying = p.playing || get().resume;
    p.el?.pause();
    get().target?.el.removeAttribute('data-open');
    t.el.setAttribute('data-open', '1');
    set({ target: t, resume: wasPlaying });
  },
  close: () => {
    const { target, resume } = get();
    target?.el.removeAttribute('data-open');
    set({ target: null, resume: false });
    if (resume) usePlayer.getState().el?.play().catch(() => {});
  },
}));

const SOURCE: Record<string, string> = { editorial: '本期重点词', dict: '离线词典', user: '我的释义' };

function Highlight({ text, word }: { text: string; word: string }) {
  const at = text.indexOf(word);
  if (at < 0) return <>{text}</>;
  return <>{text.slice(0, at)}<b className="font-semibold not-italic text-fg">{word}</b>{text.slice(at + word.length)}</>;
}

export function WordCard() {
  const { lesson } = useLesson();
  const target = useWordCard(s => s.target);
  const close = useWordCard(s => s.close);
  const words = useNotebook(s => s.words);
  const userGloss = useNotebook(s => s.userGloss);
  const upsert = useNotebook(s => s.upsert);
  const setGloss = useNotebook(s => s.setGloss);
  const [editing, setEditing] = useState(false);
  const anchor = useRef<{ getBoundingClientRect: () => DOMRect }>({ getBoundingClientRect: () => new DOMRect() });

  useEffect(() => { setEditing(false); }, [target]);
  if (target) anchor.current = { getBoundingClientRect: () => target.el.getBoundingClientRect() };

  const g = target ? glossFor(lesson, userGloss, target.key) : null;
  const saved = target ? words.some(w => w.key === target.key) : false;
  const headword = g?.word || target?.surface || '';

  function save(custom?: { word: string; zh: string; example: string }) {
    if (!target) return;
    const zh = custom?.zh ?? g?.zh ?? '';
    if (!zh) { setEditing(true); return; }
    if (custom) setGloss(target.key, { word: custom.word, zh, pos: g?.pos || '', example: custom.example });
    upsert({
      key: target.key, word: custom?.word ?? headword, zh, pos: g?.pos || '', example: custom?.example ?? target.sentence,
      date: lesson.date, topic: target.topic, source: custom ? 'user' : g?.source || '',
    });
    toast.success(saved ? '已更新生词本' : '已加入生词本', { description: custom?.word ?? headword });
    close();
  }

  return (
    <Popover.Root open={!!target} onOpenChange={o => { if (!o) close(); }}>
      <Popover.Anchor virtualRef={anchor} />
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="center"
          sideOffset={10}
          collisionPadding={16}
          onOpenAutoFocus={e => e.preventDefault()}
          className="z-50 w-[min(340px,calc(100vw-24px))] outline-none"
        >
          <motion.div
            key={target?.key}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 520, damping: 36 }}
            className="rounded-2xl border border-line-2 bg-surface/95 p-4 shadow-[var(--shadow)] backdrop-blur-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div lang="de" className="font-serif text-[26px] leading-tight font-semibold tracking-tight text-fg">{headword}</div>
                <div className="mt-0.5 text-xs text-faint">{[g?.pos, g ? SOURCE[g.source] : '词典暂无'].filter(Boolean).join(' · ')}</div>
              </div>
              <Popover.Close asChild>
                <Button variant="ghost" size="icon-sm" aria-label="关闭" className="-mr-1.5 -mt-1"><X /></Button>
              </Popover.Close>
            </div>

            {!editing ? (
              <>
                <p className={g?.zh ? 'mt-3 text-[17px] text-fg' : 'mt-3 text-sm text-muted'}>
                  {g?.zh || '这个词形不在词典里，可以写下你的理解。'}
                </p>
                {target?.sentence && (
                  <p lang="de" className="mt-3 border-l-2 border-line-2 pl-3 font-serif text-[15px] italic leading-relaxed text-fg-2">
                    <Highlight text={target.sentence} word={target.surface} />
                  </p>
                )}
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(true)}><Pencil />{g?.zh ? '改释义' : '写释义'}</Button>
                  <Button variant={saved ? 'secondary' : 'accent'} size="sm" onClick={() => save()} disabled={saved}>
                    {saved ? <><Check />已在生词本</> : <><Plus />加入生词本</>}
                  </Button>
                </div>
              </>
            ) : (
              <form
                className="mt-3 grid gap-2.5"
                onSubmit={e => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const word = String(f.get('word') || '').trim();
                  const zh = String(f.get('zh') || '').trim();
                  if (word && zh) save({ word, zh, example: String(f.get('example') || '').trim() });
                }}
              >
                <Field label="词形"><input name="word" defaultValue={headword} lang="de" required className={inputCls} /></Field>
                <Field label="中文释义"><input name="zh" defaultValue={g?.zh || ''} required autoFocus className={inputCls} placeholder="写下你的理解" /></Field>
                <Field label="例句"><textarea name="example" defaultValue={target?.sentence} lang="de" rows={2} className={inputCls + ' resize-none py-2'} /></Field>
                <div className="mt-1 flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>取消</Button>
                  <Button variant="accent" size="sm" type="submit">保存并加入</Button>
                </div>
              </form>
            )}
          </motion.div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export const inputCls = 'h-9 w-full rounded-xl border border-line-2 bg-bg-2 px-3 text-sm text-fg placeholder:text-faint outline-none transition focus:border-accent focus:ring-4 focus:ring-accent-soft';
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1 text-xs text-muted">{label}{children}</label>;
}
