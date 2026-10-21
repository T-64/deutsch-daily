import { useEffect } from 'react';
import { Footer, Logo, SettingsMenu, TopBar } from '@/components/shell';

const keys: [string, string][] = [
  ['Space', 'Abspielen · Pause'],
  ['← →', 'Satz zurück · weiter'],
  ['R', 'Satz wiederholen'],
  ['T', 'Übersetzung: aus · aktuell · alle'],
  ['/', 'Archiv durchsuchen'],
];

export function AboutPage() {
  useEffect(() => { document.title = 'Info — Deutsch Daily'; }, []);
  return (
    <>
      <TopBar><Logo /><div className="ml-auto"><SettingsMenu /></div></TopBar>
      <main className="mx-auto max-w-[1480px] px-4 pb-32 pt-20 sm:px-6 lg:px-8">
        <h1 className="font-serif text-[clamp(64px,10vw,160px)] leading-[0.85] tracking-[-0.035em] text-fg">
          Jeden Tag.<br /><span className="italic text-fg-2">Satz für Satz.</span>
        </h1>

        <dl className="mt-24 grid max-w-2xl gap-x-10 border-t border-line sm:grid-cols-[8rem_1fr]">
          {keys.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="border-b border-line py-4 font-mono text-sm text-fg">{k}</dt>
              <dd className="border-b border-line py-4 text-fg-2 max-sm:-mt-4 max-sm:border-t-0 max-sm:pt-0">{v}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-16 max-w-xl font-mono text-[11px] uppercase leading-relaxed tracking-[0.12em] text-faint">
          Übersetzungen &amp; Erklärungen: KI · Alles bleibt im Browser.
        </p>
      </main>
      <Footer />
    </>
  );
}
