"use client";

export type BulletSource = "user_stated" | "user_confirmed" | "ai_inferred";

const LABELS: Record<BulletSource, string> = {
  user_stated: "stated",
  user_confirmed: "confirmed",
  ai_inferred: "inferred",
};

const STYLES: Record<BulletSource, string> = {
  user_stated: "bg-success/10 text-success/80 border-success/20",
  user_confirmed: "bg-primary/10 text-primary/80 border-primary/20",
  ai_inferred: "bg-warning/10 text-warning/80 border-warning/20",
};

const TOOLTIPS: Record<BulletSource, string> = {
  user_stated: "You said this directly",
  user_confirmed: "You confirmed this when asked",
  ai_inferred: "The AI inferred this from context — review for accuracy",
};

interface BulletSourceChipProps {
  source: BulletSource | string | undefined | null;
}

export function BulletSourceChip({ source }: BulletSourceChipProps) {
  const s = (source ?? "ai_inferred") as BulletSource;
  const label = LABELS[s] ?? "inferred";
  const style = STYLES[s] ?? STYLES.ai_inferred;
  const tooltip = TOOLTIPS[s] ?? TOOLTIPS.ai_inferred;
  return (
    <span
      title={tooltip}
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wider border ${style}`}
    >
      {label}
    </span>
  );
}
