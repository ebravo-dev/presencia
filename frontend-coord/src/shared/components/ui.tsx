import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8102E]/40 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45',
  {
    variants: {
      variant: {
        primary: 'bg-[#C8102E] px-4 py-2.5 text-white shadow-sm hover:bg-[#b00e28] hover:shadow-md active:scale-[.97]',
        danger: 'bg-red-700 px-4 py-2.5 text-white shadow-sm hover:bg-red-800 hover:shadow-md active:scale-[.97] dark:bg-red-700 dark:hover:bg-red-600',
        secondary: 'border border-slate-200 bg-white px-4 py-2.5 text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-300 active:scale-[.97] dark:border-[#2e3138] dark:bg-[#1a1d23] dark:text-slate-200 dark:hover:bg-[#22252b] dark:hover:border-[#3a3e47]',
        ghost: 'px-3 py-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-200',
      },
    },
    defaultVariants: { variant: 'primary' },
  },
);

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean }
export function Button({ className, variant, asChild, ...props }: ButtonProps) {
  const Component = asChild ? Slot : 'button';
  return <Component className={cn(buttonVariants({ variant }), className)} {...props} />;
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-[#2e3138] dark:bg-[#1a1d23]', className)} {...props} />;
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'success' | 'danger' | 'warning' | 'info'; className?: string }) {
  const tones = {
    neutral: 'bg-slate-100 text-slate-600 ring-slate-200/60 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
    success: 'bg-emerald-50 text-emerald-700 ring-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-800',
    danger: 'bg-red-50 text-[#C8102E] ring-red-200/60 dark:bg-red-950/30 dark:text-red-400 dark:ring-red-800',
    warning: 'bg-amber-50 text-amber-700 ring-amber-200/60 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-800',
    info: 'bg-blue-50 text-blue-700 ring-blue-200/60 dark:bg-blue-950/30 dark:text-blue-400 dark:ring-blue-800',
  };
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset', tones[tone], className)}>{children}</span>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-lg bg-slate-200/70 dark:bg-[#2e3138]', className)} />;
}

export function EmptyState({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl bg-gradient-to-b from-slate-50 to-slate-100/60 px-8 text-center dark:from-[#1a1d23] dark:to-[#15181d]">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-[#22252b] dark:text-slate-500">{icon}</div>
      <h3 className="font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>
    </div>
  );
}
