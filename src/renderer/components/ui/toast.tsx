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
/** How long a toast stands before it goes, whatever the window is doing. */
const LIFETIME = 5000;

export const toast = {
  show: ({ title, description, variant = 'default', timeout, action }: ShowOptions) => {
    const id = toastManager.add({
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
    });
    // The manager pauses its own timer while the window is not in front or the
    // pointer is over the stack, which is how a corner ends up holding four
    // notices from ten minutes ago. This one does not pause.
    if (timeout !== 0) setTimeout(() => toastManager.close(id), timeout ?? LIFETIME);
    return id;
  },
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

/** How many are shown before the rest become a count. Two is a glance; four
 *  is a wall over the corner of the window. */
const SHOWN = 2;

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager<ToastData>();
  const waiting = toasts.length - SHOWN;

  return (
    <>
      {toasts.slice(0, SHOWN).map((t) => {
        const variant = t.data?.variant ?? 'default';
        const v = VARIANT_STYLES[variant];
        return (
          <ToastPrimitive.Root
            key={t.id}
            toast={t}
            className={cn(
              // In the flow of the viewport's column rather than stacked on
              // top of each other: a pile of cards fanned out under the newest
              // one is four notices where there is one.
              'w-80 max-w-[calc(100vw-3rem)] overflow-hidden',
              'rounded-2xl bg-card/95 shadow-2xl ring-1 backdrop-blur-xl',
              v.ring,
              // Animations honour reduced-motion via tw-animate-css
              'max-h-40 data-[starting-style]:translate-y-2 data-[starting-style]:opacity-0',
              // The one leaving collapses as it fades, so the one below it
              // rises with it rather than snapping up once it is gone.
              'data-[ending-style]:max-h-0 data-[ending-style]:-mt-2 data-[ending-style]:opacity-0',
              'transition-[opacity,transform,max-height,margin] duration-200 ease-out',
            )}
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
      {waiting > 0 && (
        <div className="self-end rounded-full bg-card/95 px-3 py-1 font-body text-[11px] text-muted-foreground ring-1 ring-border/60 backdrop-blur-xl">
          +{waiting} more
        </div>
      )}
    </>
  );
}

export function Toaster() {
  return (
    <ToastPrimitive.Provider toastManager={toastManager} timeout={5000} limit={6}>
      <ToastPrimitive.Portal>
        {/* Above the dock rather than under the duck: the row along the foot of
            the window is always there, and a notice landing behind it is a
            notice nobody reads. */}
        <ToastPrimitive.Viewport className="fixed right-6 bottom-[calc(var(--dock-clear)+0.5rem)] z-[300] flex w-80 max-w-[calc(100vw-3rem)] flex-col-reverse gap-2">
          <ToastList />
        </ToastPrimitive.Viewport>
      </ToastPrimitive.Portal>
    </ToastPrimitive.Provider>
  );
}
