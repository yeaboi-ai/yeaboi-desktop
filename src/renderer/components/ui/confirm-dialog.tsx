'use client';

import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Trash2, CheckCircle, X } from 'lucide-react';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'default';
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext);
  if (!fn) throw new Error('useConfirm must be used within ConfirmProvider');
  return fn;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(
    null,
  );

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({ ...options, resolve });
    });
  }, []);

  const handleConfirm = () => {
    state?.resolve(true);
    setState(null);
  };

  const handleCancel = () => {
    state?.resolve(false);
    setState(null);
  };

  const variantStyles = {
    danger: {
      icon: <Trash2 className="h-5 w-5 text-destructive" />,
      iconBg: 'bg-destructive/10',
      button: 'bg-red-500 hover:bg-red-600 text-foreground',
    },
    warning: {
      icon: <AlertTriangle className="h-5 w-5 text-warning" />,
      iconBg: 'bg-warning/10',
      button: 'bg-amber-500 hover:bg-amber-600 text-black',
    },
    default: {
      icon: <CheckCircle className="h-5 w-5 text-success" />,
      iconBg: 'bg-success/10',
      button: 'bg-success hover:bg-success text-foreground',
    },
  };

  const v = state ? variantStyles[state.variant || 'default'] : variantStyles.default;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state &&
        typeof window !== 'undefined' &&
        createPortal(
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm animate-in fade-in duration-200"
              onClick={handleCancel}
            />

            {/* Dialog */}
            <div className="fixed inset-0 z-[101] flex items-center justify-center p-4">
              <div
                className="w-full max-w-sm bg-secondary border border-border rounded-2xl shadow-2xl animate-in zoom-in-95 fade-in duration-200"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex items-start gap-3 p-5 pb-3">
                  <div className={`${v.iconBg} rounded-full p-2 shrink-0`}>{v.icon}</div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-foreground">{state.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {state.message}
                    </p>
                  </div>
                  <button
                    onClick={handleCancel}
                    className="p-1 rounded-lg text-muted-foreground/50 hover:text-muted-foreground hover:bg-foreground/[0.05] transition-colors shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Actions */}
                <div className="flex gap-2 p-5 pt-3">
                  <button
                    onClick={handleCancel}
                    className="flex-1 px-4 py-2 text-xs font-medium rounded-xl bg-foreground/[0.05] text-muted-foreground hover:bg-foreground/[0.10] hover:text-foreground/90 transition-colors"
                  >
                    {state.cancelLabel || 'Cancel'}
                  </button>
                  <button
                    onClick={handleConfirm}
                    className={`flex-1 px-4 py-2 text-xs font-medium rounded-xl transition-colors ${v.button}`}
                  >
                    {state.confirmLabel || 'Confirm'}
                  </button>
                </div>
              </div>
            </div>
          </>,
          document.body,
        )}
    </ConfirmContext.Provider>
  );
}
