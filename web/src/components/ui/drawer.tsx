import * as React from 'react';
import { Drawer as Vaul } from 'vaul';
import { cn } from '@/lib/utils';

export function Drawer({ open, onOpenChange, title, children, className }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; children: React.ReactNode; className?: string;
}) {
  return (
    <Vaul.Root open={open} onOpenChange={onOpenChange}>
      <Vaul.Portal>
        <Vaul.Overlay className="fixed inset-0 z-40 bg-[var(--scrim)] backdrop-blur-[2px]" />
        <Vaul.Content
          aria-describedby={undefined}
          className={cn('fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t-[22px] border-t border-line-2 bg-bg-2 outline-none', className)}
        >
          <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-line-2" />
          <Vaul.Title className="sr-only">{title}</Vaul.Title>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-3 scrollbar-thin">{children}</div>
        </Vaul.Content>
      </Vaul.Portal>
    </Vaul.Root>
  );
}
