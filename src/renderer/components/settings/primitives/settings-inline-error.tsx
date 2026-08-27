import { AlertCircle } from "lucide-react";

type SettingsInlineErrorProps = {
  message: string;
};

export function SettingsInlineError({ message }: SettingsInlineErrorProps) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/15 px-4 py-3 text-xs text-destructive font-body animate-slide-up motion-reduce:animate-none"
    >
      <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
