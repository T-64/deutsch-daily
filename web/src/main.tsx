import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Backdrop } from '@/components/Backdrop';
import { usePrefsEffects } from '@/components/shell';
import { readPage } from '@/lib/data';
import { usePrefs } from '@/lib/store';
import { AboutPage } from '@/pages/AboutPage';
import { HomePage } from '@/pages/HomePage';
import { LessonPage } from '@/pages/LessonPage';
import { OpenPage } from '@/pages/OpenPage';
import { sample } from '@/sample';
import './styles.css';

const page = import.meta.env.DEV && !document.getElementById('dd-data') ? sample() : readPage();

function App() {
  usePrefsEffects();
  const theme = usePrefs(p => p.theme);
  const toastTheme = theme === 'system' ? 'system' : theme;
  return (
    <TooltipProvider delayDuration={350}>
      <Backdrop />
      {page.page === 'home' && <HomePage items={page.items} />}
      {page.page === 'lesson' && <LessonPage lesson={page.lesson} />}
      {page.page === 'open' && <OpenPage items={page.items} />}
      {page.page === 'about' && <AboutPage />}
      <Toaster position="bottom-center" theme={toastTheme} offset={88} toastOptions={{ classNames: { toast: '!rounded-2xl !border-line-2 !bg-surface !text-fg !shadow-[var(--shadow)]', description: '!text-muted' } }} />
    </TooltipProvider>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
