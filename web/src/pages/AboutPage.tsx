import { useEffect } from 'react';
import { Footer, Logo, SettingsMenu, TopBar } from '@/components/shell';
import { Button } from '@/components/ui/button';

const steps = [
  ['播放原声', '每期就是当天的 tagesschau in Einfacher Sprache 节目，字幕是官方逐字稿，按句切好，带时间轴。'],
  ['逐句跟读', '选「逐句跟读」，每句播完会停下来，跟着说一遍，按空格继续。难句用「单句循环」，或者放慢到 0.75×。'],
  ['先盲听，再看中文', '中文默认只显示正在播放的这一句；想挑战就切到「盲听」，某句听不懂再单独点开。'],
  ['点词、收藏、复习', '点任意单词查释义，查词时视频会暂停。收进生词本，导出 Anki 卡片复习。'],
];

export function AboutPage() {
  useEffect(() => { document.title = '关于 — Deutsch Daily'; }, []);
  return (
    <>
      <TopBar><Logo /><div className="ml-auto"><SettingsMenu /></div></TopBar>
      <main className="mx-auto max-w-3xl px-4 pb-28 pt-20 sm:px-6">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Über das Projekt</p>
        <h1 className="mt-3 text-[clamp(34px,5vw,60px)] font-semibold leading-[1.04] tracking-[-0.04em] text-fg">
          一档新闻，<span lang="de" className="font-serif font-normal italic text-accent">jeden Tag.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-fg-2">
          Deutsch Daily 把每天的 tagesschau 简易德语新闻变成一节可以跟读的听力课：原声、官方字幕、逐句中文、重点词汇和语法，适合 A2–B1。
        </p>

        <ol className="mt-16 divide-y divide-[var(--line)] border-y border-line">
          {steps.map(([t, b], i) => (
            <li key={t} className="grid gap-2 py-7 sm:grid-cols-[80px_1fr]">
              <span className="font-mono text-sm tabular text-accent">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-fg">{t}</h2>
                <p className="mt-2 leading-relaxed text-muted">{b}</p>
              </div>
            </li>
          ))}
        </ol>

        <section className="mt-16 grid gap-10 sm:grid-cols-2">
          <div>
            <h2 className="text-lg font-semibold text-fg">快捷键</h2>
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-5 gap-y-2.5 text-sm">
              {[['Space', '播放 / 暂停（逐句模式下继续下一句）'], ['← →', '上一句 / 下一句'], ['R', '重听这一句'], ['T', '切换中文：盲听 / 当前句 / 全部'], ['/', '在首页搜索往期']].map(([k, v]) => (
                <div key={k} className="contents"><dt><kbd className="rounded-md border border-line-2 bg-surface px-1.5 py-0.5 font-mono text-xs text-fg-2">{k}</kbd></dt><dd className="text-muted">{v}</dd></div>
              ))}
            </dl>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-fg">隐私</h2>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              没有账号，也没有统计。主题、字号、生词本和最近课程只保存在你的浏览器里。播放视频时浏览器会直接连接 ARD 的视频服务器；导出 Anki 时才会从 jsDelivr 加载 sql.js。清除本站的浏览器数据即可全部删除。
            </p>
          </div>
        </section>

        <section className="mt-16 rounded-[24px] border border-line bg-surface/50 p-7">
          <h2 className="text-lg font-semibold text-fg">内容与版权</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            节目视频和官方字幕的权利属于 ARD / NDR tagesschau，本站只做个人、非商业的语言学习整理。中文译文、词汇和语法讲解由 AI 生成，可能有误。
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button asChild variant="accent"><a href="index.html">开始学习</a></Button>
            <Button asChild variant="outline"><a href="studio.html">本地课程工坊</a></Button>
            <Button asChild variant="ghost"><a href="https://github.com/T-64/deutsch-daily" rel="noreferrer">GitHub</a></Button>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
