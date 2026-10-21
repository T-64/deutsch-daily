import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { Check, Github, Minus, Monitor, Moon, Plus, Sun, Type } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { SCALES, applyTheme, usePrefs, type Theme } from '@/lib/store';
import { cn } from '@/lib/utils';

export function usePrefsEffects() {
  const theme = usePrefs(p => p.theme);
  const scale = usePrefs(p => p.scale);
  useEffect(() => applyTheme(theme), [theme]);
  useEffect(() => { document.documentElement.style.setProperty('--reader-scale', String(SCALES[scale] ?? 1)); }, [scale]);
}

export function Logo({ className }: { className?: string }) {
  return (
    <a href="index.html" className={cn('group inline-flex items-center gap-2.5 text-fg', className)} aria-label="Deutsch Daily 首页">
      <span className="relative grid size-7 place-items-center overflow-hidden rounded-[9px] bg-fg text-bg">
        <span className="font-serif text-[15px] font-semibold italic leading-none">D</span>
        <span className="absolute bottom-1 right-1 size-1.5 rounded-full bg-accent transition-transform duration-500 group-hover:scale-150" />
      </span>
      <span className="text-[15px] font-semibold tracking-tight">Deutsch Daily</span>
    </a>
  );
}

export function TopBar({ children, className, transparent = false }: { children?: React.ReactNode; className?: string; transparent?: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return (
    <header
      className={cn(
        'sticky top-0 z-30 h-14 border-b transition-[background-color,border-color,backdrop-filter] duration-300',
        scrolled || !transparent ? 'border-line bg-[color-mix(in_oklch,var(--bg)_82%,transparent)] backdrop-blur-xl backdrop-saturate-150' : 'border-transparent bg-transparent',
        className,
      )}
    >
      <div className="relative mx-auto flex h-full max-w-[1480px] items-center gap-3 px-4 sm:px-6 lg:px-8">{children}</div>
    </header>
  );
}

const themes: { v: Theme; label: string; icon: React.ReactNode }[] = [
  { v: 'system', label: '跟随系统', icon: <Monitor /> },
  { v: 'dark', label: '深色', icon: <Moon /> },
  { v: 'light', label: '浅色', icon: <Sun /> },
];

export function SettingsMenu() {
  const theme = usePrefs(p => p.theme);
  const scale = usePrefs(p => p.scale);
  const set = usePrefs(p => p.set);
  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label="显示设置"><Type /></Button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content align="end" sideOffset={8} className="z-50 w-60 rounded-2xl border border-line-2 bg-surface/95 p-1.5 shadow-[var(--shadow)] backdrop-blur-xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
          <Dropdown.Label className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">外观</Dropdown.Label>
          {themes.map(t => (
            <Dropdown.Item
              key={t.v}
              onSelect={e => { e.preventDefault(); set({ theme: t.v }); }}
              className="flex h-9 cursor-pointer items-center gap-2.5 rounded-xl px-2.5 text-sm text-fg-2 outline-none data-[highlighted]:bg-surface-2 data-[highlighted]:text-fg [&_svg]:size-4"
            >
              {t.icon}{t.label}{theme === t.v && <Check className="ml-auto text-accent" />}
            </Dropdown.Item>
          ))}
          <Dropdown.Separator className="my-1.5 h-px bg-line" />
          <div className="flex items-center justify-between px-2.5 py-1.5">
            <span className="text-sm text-fg-2">字号</span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon-sm" aria-label="缩小字号" disabled={scale <= 0} onClick={() => set({ scale: scale - 1 })}><Minus /></Button>
              <span className="w-10 text-center font-mono text-xs tabular text-muted">{Math.round(SCALES[scale] * 100)}%</span>
              <Button variant="ghost" size="icon-sm" aria-label="放大字号" disabled={scale >= SCALES.length - 1} onClick={() => set({ scale: scale + 1 })}><Plus /></Button>
            </div>
          </div>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-x-8 gap-y-4 px-4 py-10 text-sm text-muted sm:px-6 lg:px-8">
        <div className="flex items-center gap-3"><Logo /><span className="hidden text-faint sm:inline">跟着 tagesschau，一句一句学德语。</span></div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2">
          <a className="hover:text-fg" href="index.html#archive">往期</a>
          <a className="hover:text-fg" href="open.html">用链接打开</a>
          <a className="hover:text-fg" href="studio.html">本地课程工坊</a>
          <a className="hover:text-fg" href="about.html">关于</a>
          <a className="inline-flex items-center gap-1.5 hover:text-fg" href="https://github.com/T-64/deutsch-daily" rel="noreferrer"><Github className="size-4" />GitHub</a>
        </nav>
      </div>
      <p className="mx-auto max-w-[1480px] px-4 pb-10 text-xs leading-relaxed text-faint sm:px-6 lg:px-8">
        视频与官方字幕版权归 ARD / NDR tagesschau 所有，本站仅作个人非商业语言学习。中文译文与讲解由 AI 生成，可能有误。
      </p>
    </footer>
  );
}
