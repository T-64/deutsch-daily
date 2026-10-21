import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { motion } from 'motion/react';
import { useId } from 'react';
import { cn } from '@/lib/utils';

export function Segmented<T extends string>({
  value, onChange, options, label, className, size = 'md',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; title?: string }[];
  label: string;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const id = useId();
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={v => v && onChange(v as T)}
      aria-label={label}
      className={cn('relative inline-flex items-center rounded-full bg-surface-2 p-1', className)}
    >
      {options.map(o => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          title={o.title}
          className={cn(
            'relative z-0 inline-flex items-center justify-center gap-1.5 rounded-full font-medium text-muted transition-colors hover:text-fg data-[state=on]:text-fg',
            size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-[13px]',
          )}
        >
          {value === o.value && (
            <motion.span
              layoutId={id}
              className="absolute inset-0 -z-10 rounded-full bg-surface shadow-[0_1px_2px_oklch(0_0_0/.3)]"
              transition={{ type: 'spring', stiffness: 500, damping: 38 }}
            />
          )}
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
