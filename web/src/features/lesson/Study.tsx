import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { BookMarked, Check, Copy, Download, GripVertical, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { exportApkg } from '@/lib/anki';
import { usePlayer } from '@/lib/player';
import { useNotebook, usePrefs, type Word } from '@/lib/store';
import { cn } from '@/lib/utils';
import { useLesson } from './context';
import { Field, inputCls } from './WordCard';

export function Study({ tab, onTab, className }: { tab: string; onTab: (t: string) => void; className?: string }) {
  const count = useNotebook(s => s.words.length);
  return (
    <Tabs value={tab} onValueChange={onTab} className={cn('flex min-h-0 flex-col', className)}>
      <TabsList className="self-start">
        <TabsTrigger value="story"><Sparkles className="size-3.5" />Lektion</TabsTrigger>
        <TabsTrigger value="notebook">
          <BookMarked className="size-3.5" />Merkliste
          <span className="rounded-full bg-accent-soft px-1.5 text-[11px] tabular text-accent">{count}</span>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="story" className="mt-4 min-h-0 flex-1"><StoryStudy /></TabsContent>
      <TabsContent value="notebook" className="mt-4 min-h-0 flex-1"><Notebook /></TabsContent>
    </Tabs>
  );
}

function StoryStudy() {
  const { lesson, storyOf } = useLesson();
  const active = usePlayer(s => s.active);
  const [pinned, setPinned] = useState<number | null>(null);
  const auto = Math.max(0, storyOf(active));
  const k = pinned ?? auto;
  const story = lesson.stories[k];
  const words = useNotebook(s => s.words);
  const upsert = useNotebook(s => s.upsert);
  const zhMode = usePrefs(p => p.zh);
  if (!story) return null;
  return (
    <div>
      <div className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1 scrollbar-none">
        {lesson.stories.map((s, i) => (
          <button
            key={i}
            type="button"
            onClick={() => { setPinned(i === auto ? null : i); document.getElementById(`story-${i + 1}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1 text-xs transition',
              i === k ? 'border-transparent bg-fg text-bg' : 'border-line-2 text-muted hover:text-fg',
            )}
            title={s.title}
          >
            {String(i + 1).padStart(2, '0')}
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={k} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}>
          <p lang="de" className="font-serif text-[26px] leading-tight text-fg">{story.title}</p>
          {story.title_zh && zhMode !== 'hidden' && <p className="mt-1 text-sm text-muted">{story.title_zh}</p>}

          {story.vocab.length > 0 && (
            <section className="mt-5">
              <h3 className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">Wörter</h3>
              <ul className="divide-y divide-[var(--line)]">
                {story.vocab.map(v => {
                  const saved = words.some(w => w.key === v.key);
                  return (
                    <li key={v.key} className="group flex items-start gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span lang="de" className="font-serif text-[21px] leading-tight text-fg">{v.lemma}</span>
                          {v.pos && <span className="text-[11px] text-faint">{v.pos}</span>}
                        </div>
                        <p className="text-sm text-fg-2">{v.zh}</p>
                        {v.example_de && <p lang="de" className="mt-1 text-[13px] leading-relaxed text-muted">{v.example_de}</p>}
                      </div>
                      <Button
                        variant={saved ? 'secondary' : 'ghost'}
                        size="icon-sm"
                        aria-label={saved ? 'Gemerkt' : 'Merken'}
                        disabled={saved}
                        onClick={() => {
                          upsert({ key: v.key, word: v.lemma, zh: v.zh, pos: v.pos, example: v.example_de, exampleZh: v.example_zh, date: lesson.date, topic: story.title, source: 'editorial' });
                          toast.success(v.lemma, { description: 'Gemerkt' });
                        }}
                      >
                        {saved ? <Check className="text-accent" /> : <Plus />}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {story.grammar.length > 0 && (
            <section className="mt-5">
              <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">Grammatik</h3>
              {story.grammar.map((g, i) => (
                <div key={i} className="rounded-2xl border border-line bg-surface/60 p-4">
                  <p className="text-sm font-semibold text-fg">{g.title}</p>
                  {g.example_de && <p lang="de" className="mt-2 text-[14px] text-fg-2">{g.example_de}</p>}
                  {g.example_zh && <p className="text-xs text-muted">{g.example_zh}</p>}
                  {g.summary && <p className="mt-2 text-[13.5px] leading-relaxed text-fg-2">{g.summary}</p>}
                </div>
              ))}
            </section>
          )}

          {story.background && (
            <details className="mt-5 text-sm text-fg-2">
              <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.18em] text-faint">Hintergrund · KI</summary>
              <p className="mt-2 leading-relaxed">{story.background}</p>
            </details>
          )}

        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function SortableWord({ w, onEdit }: { w: Word; onEdit: (w: Word) => void }) {
  const remove = useNotebook(s => s.remove);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: w.key });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('group relative flex items-start gap-2 rounded-xl py-3 pr-1', isDragging && 'z-10 bg-surface shadow-[var(--shadow)] ring-1 ring-line-2')}
    >
      <button type="button" aria-label="Verschieben" className="mt-1 cursor-grab touch-none rounded p-0.5 text-faint opacity-40 transition hover:text-fg group-hover:opacity-100 active:cursor-grabbing" {...attributes} {...listeners}>
        <GripVertical className="size-4" />
      </button>
      <div className="min-w-0 flex-1">
        <p lang="de" className="font-serif text-[21px] leading-tight text-fg">{w.word}</p>
        <p className="text-sm text-fg-2">{w.zh || '—'}</p>
        {w.example && <p lang="de" className="mt-0.5 line-clamp-2 text-[13px] text-muted">{w.example}</p>}
        {w.date && <p className="mt-1 font-mono text-[10px] text-faint">{w.date}</p>}
      </div>
      <div className="flex opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 max-lg:opacity-100">
        <Button variant="ghost" size="icon-sm" aria-label="Bearbeiten" onClick={() => onEdit(w)}><Pencil /></Button>
        <Button variant="ghost" size="icon-sm" aria-label="Löschen" className="hover:text-danger" onClick={() => { remove(w.key); toast(w.word, { description: 'Gelöscht' }); }}><Trash2 /></Button>
      </div>
    </li>
  );
}

function Notebook() {
  const words = useNotebook(s => s.words);
  const reorder = useNotebook(s => s.reorder);
  const upsert = useNotebook(s => s.upsert);
  const setGloss = useNotebook(s => s.setGloss);
  const [editing, setEditing] = useState<Word | 'new' | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const keys = words.map(w => w.key);
    reorder(arrayMove(keys, keys.indexOf(String(e.active.id)), keys.indexOf(String(e.over.id))));
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-1 flex justify-end">
        <Button variant="ghost" size="icon-sm" aria-label="Hinzufügen" onClick={() => setEditing('new')}><Plus /></Button>
      </div>
      <AnimatePresence>
        {editing && (
          <motion.form
            key="form"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
            onSubmit={e => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const word = String(f.get('word') || '').trim();
              const zh = String(f.get('zh') || '').trim();
              const example = String(f.get('example') || '').trim();
              if (!word || !zh) return;
              const key = editing === 'new' ? word.toLocaleLowerCase('de-DE') : editing.key;
              setGloss(key, { word, zh, pos: editing === 'new' ? '' : editing.pos, example });
              upsert({ key, word, zh, example, manual: editing === 'new' });
              setEditing(null);
              toast.success(word, { description: 'Gespeichert' });
            }}
          >
            <div className="mb-3 grid gap-2.5 rounded-2xl border border-line-2 bg-surface p-4">
              <Field label="Wort"><input name="word" lang="de" required autoFocus defaultValue={editing === 'new' ? '' : editing.word} className={inputCls} placeholder="die Entscheidung" /></Field>
              <Field label="Bedeutung"><input name="zh" required defaultValue={editing === 'new' ? '' : editing.zh} className={inputCls} /></Field>
              <Field label="Beispiel"><textarea name="example" lang="de" rows={2} defaultValue={editing === 'new' ? '' : editing.example} className={inputCls + ' h-auto resize-none py-2'} /></Field>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Abbrechen</Button>
                <Button variant="accent" size="sm" type="submit">Speichern</Button>
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
      {words.length === 0 ? (
        <div className="grid place-items-center rounded-2xl border border-dashed border-line-2 px-6 py-10 text-center">
          <BookMarked className="size-6 text-faint" />
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={words.map(w => w.key)} strategy={verticalListSortingStrategy}>
            <ul className="min-h-0 flex-1 divide-y divide-[var(--line)] overflow-y-auto scrollbar-thin">
              {words.map(w => <SortableWord key={w.key} w={w} onEdit={setEditing} />)}
            </ul>
          </SortableContext>
        </DndContext>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3">
        <Button
          variant="outline"
          size="sm"
          disabled={!words.length}
          onClick={() => {
            const text = words.map(w => [w.word, w.zh, w.example].filter(Boolean).join('\t')).join('\n');
            navigator.clipboard?.writeText(text).then(() => toast.success(`${words.length}`, { description: 'Kopiert' }), () => toast.error('Fehler'));
          }}
        >
          <Copy />Kopieren
        </Button>
        <Button
          variant="default"
          size="sm"
          disabled={!words.length || busy}
          onClick={async () => {
            setBusy(true);
            try {
              const n = await exportApkg(words, (m?: string) => setStatus(m ?? ''));
              setStatus('');
              toast.success(`${n} Karten`, { description: '.apkg' });
            } catch (err) {
              setStatus((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Download />Anki
        </Button>
      </div>
      {status && <p className="mt-2 text-xs text-muted" aria-live="polite">{status}</p>}
    </div>
  );
}
