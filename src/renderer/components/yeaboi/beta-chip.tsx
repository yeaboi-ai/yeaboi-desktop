// The TUI's inverse-video BETA chip, translated: bold dark text on the beta
// amber (BETA_RGB in yeaboi.ai's beta.py), dimmed where it annotates a
// resting card. Worn by the beta worlds (Solo, Agents) on the chooser and
// their home eyebrows.

export function BetaChip({ dim, className = '' }: { dim?: boolean; className?: string }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-body font-bold tracking-wide ${className}`}
      style={{
        background: dim ? 'rgb(112, 69, 40)' : 'rgb(224, 138, 72)',
        color: 'rgb(20, 16, 12)',
      }}
    >
      BETA
    </span>
  );
}
