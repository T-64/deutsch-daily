import { createContext, useContext, useMemo } from 'react';
import type { Lesson, Story } from '@/lib/data';
import { makeTokenizer, type Token } from '@/lib/words';

interface LessonCtx {
  lesson: Lesson;
  tokenize: (text: string) => Token[];
  storyOf: (sentence: number) => number;
}

const Ctx = createContext<LessonCtx | null>(null);

export function LessonProvider({ lesson, children }: { lesson: Lesson; children: React.ReactNode }) {
  const value = useMemo<LessonCtx>(() => {
    const owner = new Int32Array(lesson.sentences.length).fill(-1);
    lesson.stories.forEach((s: Story, k) => { for (let i = s.from; i <= s.to; i++) owner[i] = k; });
    return { lesson, tokenize: makeTokenizer(lesson), storyOf: i => (i >= 0 ? owner[i] ?? -1 : -1) };
  }, [lesson]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLesson() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLesson outside LessonProvider');
  return v;
}
