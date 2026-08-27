interface ConfidenceBadgeProps {
  confirmed: boolean;
}

export function ConfidenceBadge({ confirmed }: ConfidenceBadgeProps) {
  return confirmed ? (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/20 text-success">confirmed</span>
  ) : (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/20 text-warning">ai-inferred</span>
  );
}
