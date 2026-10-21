import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-[background-color,color,box-shadow,transform,opacity] duration-200 ease-out active:scale-[.97] disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4 outline-none focus-visible:ring-2 focus-visible:ring-ring',
  {
    variants: {
      variant: {
        default: 'bg-fg text-bg hover:opacity-90',
        accent: 'bg-accent text-accent-fg hover:brightness-105 shadow-[0_8px_30px_-8px_var(--accent)]',
        secondary: 'bg-surface-2 text-fg hover:bg-[color-mix(in_oklch,var(--surface-2),var(--fg)_6%)]',
        outline: 'border border-line-2 bg-transparent text-fg hover:bg-surface-2',
        ghost: 'text-fg-2 hover:bg-surface-2 hover:text-fg',
        link: 'text-accent underline-offset-4 hover:underline rounded-md',
      },
      size: {
        default: 'h-9 px-4',
        sm: 'h-8 px-3 text-[13px]',
        lg: 'h-11 px-6 text-[15px]',
        icon: 'size-9',
        'icon-sm': 'size-8',
        'icon-lg': 'size-12',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...(asChild ? {} : { type: props.type ?? 'button' })} {...props} />;
});
Button.displayName = 'Button';
