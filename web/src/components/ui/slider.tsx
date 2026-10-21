import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '@/lib/utils';

export const Slider = React.forwardRef<React.ElementRef<typeof SliderPrimitive.Root>, React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & { buffered?: number }>(
  ({ className, buffered = 0, ...props }, ref) => (
    <SliderPrimitive.Root ref={ref} className={cn('group relative flex h-5 w-full touch-none select-none items-center', className)} {...props}>
      <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-line-2 transition-[height] group-hover:h-1.5">
        <span className="absolute inset-y-0 left-0 bg-line-2" style={{ width: `${buffered * 100}%` }} />
        <SliderPrimitive.Range className="absolute h-full bg-fg" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label="Position"
        className="block size-3.5 scale-0 rounded-full bg-fg shadow transition-transform group-hover:scale-100 focus-visible:scale-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring"
      />
    </SliderPrimitive.Root>
  ),
);
Slider.displayName = 'Slider';
