import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

const buttonVariants = cva('inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8102E] disabled:pointer-events-none disabled:opacity-50', {
  variants: { variant: {
    primary: 'bg-[#C8102E] px-4 py-2.5 text-white hover:bg-[#a80d27]',
    secondary: 'border border-slate-300 bg-white px-4 py-2.5 text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800',
    ghost: 'px-3 py-2 text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white',
  } }, defaultVariants: { variant: 'primary' },
});
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean }
export function Button({ className, variant, asChild, ...props }: ButtonProps) {
  const Component = asChild ? Slot : 'button'; return <Component className={cn(buttonVariants({ variant }), className)} {...props} />;
}
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div className={cn('rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900', className)} {...props} />; }
export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'success' | 'danger' | 'warning' | 'info'; className?: string }) {
  const tones = { neutral: 'bg-slate-100 text-slate-700', success: 'bg-emerald-50 text-emerald-700 ring-emerald-200', danger: 'bg-red-50 text-[#C8102E] ring-red-200', warning: 'bg-amber-50 text-amber-800 ring-amber-200', info: 'bg-blue-50 text-blue-700 ring-blue-200' };
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset', tones[tone], className)}>{children}</span>;
}
export function Skeleton({ className }: { className?: string }) { return <div aria-hidden="true" className={cn('animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800', className)} />; }
export function EmptyState({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 text-center dark:border-slate-700 dark:bg-slate-900"><div className="mb-3 text-slate-400">{icon}</div><h3 className="font-semibold text-slate-900 dark:text-white">{title}</h3><p className="mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">{description}</p></div>;
}
