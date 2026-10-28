import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { Check, Github, Minus, Monitor, Moon, Plus, Star, Sun, Type } from 'lucide-react';
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
    <a href="index.html" className={cn('group inline-flex items-baseline gap-1.5 text-fg', className)} aria-label="Deutsch Daily">
      <span className="font-serif text-[22px] leading-none tracking-[-0.01em]">Deutsch <span className="italic">Daily</span></span>
      <span className="size-1.5 translate-y-[-1px] rounded-full bg-accent transition-transform duration-500 group-hover:scale-150" />
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
  { v: 'system', label: 'System', icon: <Monitor /> },
  { v: 'dark', label: 'Dunkel', icon: <Moon /> },
  { v: 'light', label: 'Hell', icon: <Sun /> },
];

export function SettingsMenu() {
  const theme = usePrefs(p => p.theme);
  const scale = usePrefs(p => p.scale);
  const set = usePrefs(p => p.set);
  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label="Darstellung"><Type /></Button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content align="end" sideOffset={8} className="z-50 w-52 rounded-2xl border border-line-2 bg-surface/95 p-1.5 shadow-[var(--shadow)] backdrop-blur-xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
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
            <Type className="size-4 text-fg-2" aria-hidden />
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon-sm" aria-label="Kleiner" disabled={scale <= 0} onClick={() => set({ scale: scale - 1 })}><Minus /></Button>
              <span className="w-10 text-center font-mono text-xs tabular text-muted">{Math.round(SCALES[scale] * 100)}%</span>
              <Button variant="ghost" size="icon-sm" aria-label="Größer" disabled={scale >= SCALES.length - 1} onClick={() => set({ scale: scale + 1 })}><Plus /></Button>
            </div>
          </div>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

const REPO = 'T-64/deutsch-daily';

/* Star call-to-action for the open-source repo (no live count). */
export function GitHubStar() {
  return (
    <a
      href={`https://github.com/${REPO}`}
      target="_blank"
      rel="noreferrer"
      aria-label="Star on GitHub"
      className="group inline-flex h-8 items-center gap-2 rounded-full border border-line-2 bg-surface/40 pl-2.5 pr-3 text-[13px] text-fg-2 backdrop-blur transition hover:border-accent hover:text-fg"
    >
      <Github className="size-4" />
      <Star className="size-3.5 transition-colors group-hover:fill-accent group-hover:text-accent" />
      <span>Star</span>
    </a>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-x-8 gap-y-3 px-4 py-8 font-mono text-[11px] uppercase tracking-[0.12em] text-faint sm:px-6 lg:px-8">
        <span>Video &amp; Untertitel © ARD / NDR tagesschau</span>
        <nav className="flex gap-6">
          <a className="hover:text-fg" href="studio.html">Studio</a>
          <a className="hover:text-fg" href="open.html">Link</a>
          <a className="hover:text-fg" href="about.html">Info</a>
          <a className="inline-flex items-center gap-1.5 hover:text-fg" href="https://github.com/T-64/deutsch-daily" rel="noreferrer" aria-label="GitHub"><Github className="size-3.5" /></a>
        </nav>
      </div>
    </footer>
  );
}
