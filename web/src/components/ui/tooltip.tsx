import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tip({ label, kbd, children, side = 'top' }: { label: string; kbd?: string; children: React.ReactElement; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={8}
          className={cn(
            'z-50 flex items-center gap-2 rounded-lg border border-line-2 bg-surface px-2.5 py-1.5 text-xs text-fg-2 shadow-[var(--shadow)]',
            'data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95',
          )}
        >
          {label}
          {kbd && <kbd className="rounded border border-line-2 px-1 font-mono text-[10px] text-muted">{kbd}</kbd>}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
