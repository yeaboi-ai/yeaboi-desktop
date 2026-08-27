'use client';

import * as React from 'react';
import { Toast as ToastPrimitive } from '@base-ui/react/toast';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

import { cn } from '@/lib/utils';

type ToastVariant = 'default' | 'success' | 'warning' | 'destructive';

export interface ToastData {
  variant?: ToastVariant;
}

export const toastManager = ToastPrimitive.createToastManager<ToastData>();

interface ShowOptions {
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: ToastVariant;
  /** ms; 0 disables auto-dismiss. Default 5000. */
  timeout?: number;
  /** Optional action button label + handler (e.g. "Undo"). */
  action?: { label: string; onClick: () => void };
}

/**
 * Imperative toast API usable from anywhere (event handlers, hooks, callbacks).
 * Returns the toast id so the caller can `toast.dismiss(id)` early.
 */
export const toast = {
  show: ({ title, description, variant = 'default', timeout, action }: ShowOptions) =>
    toastManager.add({
      title,
      description,
      timeout,
      data: { variant },
      ...(action && {
        actionProps: {
          children: action.label,
          onClick: action.onClick,
        },
      }),
    }),
  success: (opts: Omit<ShowOptions, 'variant'>) => toast.show({ ...opts, variant: 'success' }),
  warning: (opts: Omit<ShowOptions, 'variant'>) => toast.show({ ...opts, variant: 'warning' }),
  error: (opts: Omit<ShowOptions, 'variant'>) => toast.show({ ...opts, variant: 'destructive' }),
  dismiss: (id?: string) => toastManager.close(id),
};

const VARIANT_STYLES: Record<ToastVariant, { ring: string; icon: React.ReactNode | null }> = {
  default: { ring: 'ring-border/70', icon: <Info className="h-4 w-4 text-muted-foreground" /> },
  success: { ring: 'ring-success/30', icon: <CheckCircle2 className="h-4 w-4 text-success" /> },
  warning: { ring: 'ring-warning/30', icon: <AlertTriangle className="h-4 w-4 text-warning" /> },
  destructive: {
    ring: 'ring-destructive/30',
    icon: <XCircle className="h-4 w-4 text-destructive" />,
  },
};

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager<ToastData>();

  return (
    <>
      {toasts.map((t) => {
        const variant = t.data?.variant ?? 'default';
        const v = VARIANT_STYLES[variant];
        return (
          <ToastPrimitive.Root
            key={t.id}
            toast={t}
            className={cn(
              // Stack-from-the-top behavior; viewport handles the layout grid.
              'absolute right-0 bottom-0 left-auto w-80 max-w-[calc(100vw-3rem)]',
              'rounded-2xl bg-card/95 backdrop-blur-xl shadow-2xl ring-1',
              v.ring,
              // Animations honour reduced-motion via tw-animate-css
              'data-[starting-style]:opacity-0 data-[starting-style]:translate-y-2',
              'data-[ending-style]:opacity-0 data-[ending-style]:translate-y-2',
              'transition-[opacity,transform,scale] duration-200',
              // Stack offset for older toasts
              '[transform:translateX(calc(var(--toast-swipe-movement-x)))_translateY(calc(var(--toast-swipe-movement-y)+(var(--toast-index)*-12px)))_scale(calc(1-(var(--toast-index)*0.04)))]',
              'data-[expanded]:[transform:translateX(calc(var(--toast-swipe-movement-x)))_translateY(calc(var(--toast-swipe-movement-y)+(var(--toast-offset-y)*-1)-(var(--toast-index)*var(--gap))))_scale(1)]',
            )}
            style={{ ['--gap' as never]: '12px' }}
          >
            <div className="flex items-start gap-3 px-4 py-3.5">
              {v.icon && (
                <div className="shrink-0 pt-0.5" aria-hidden>
                  {v.icon}
                </div>
              )}
              <div className="flex-1 min-w-0">
                {t.title && (
                  <ToastPrimitive.Title className="text-[13px] font-medium text-foreground leading-snug">
                    {t.title}
                  </ToastPrimitive.Title>
                )}
                {t.description && (
                  <ToastPrimitive.Description className="text-[12px] text-muted-foreground leading-snug mt-0.5">
                    {t.description}
                  </ToastPrimitive.Description>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {t.actionProps && (
                  <ToastPrimitive.Action
                    className="px-2.5 py-1 rounded-md text-[12px] font-medium text-primary hover:bg-primary/10 transition-colors"
                    {...t.actionProps}
                  />
                )}
                <ToastPrimitive.Close
                  className="p-1 rounded-md text-muted-foreground/50 hover:text-foreground/80 hover:bg-foreground/[0.05] transition-colors"
                  aria-label="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </ToastPrimitive.Close>
              </div>
            </div>
          </ToastPrimitive.Root>
        );
      })}
    </>
  );
}

export function Toaster() {
  return (
    <ToastPrimitive.Provider toastManager={toastManager} timeout={5000} limit={3}>
      <ToastPrimitive.Portal>
        <ToastPrimitive.Viewport className="fixed bottom-6 right-6 z-[300] w-80 max-w-[calc(100vw-3rem)]">
          <ToastList />
        </ToastPrimitive.Viewport>
      </ToastPrimitive.Portal>
    </ToastPrimitive.Provider>
  );
}
